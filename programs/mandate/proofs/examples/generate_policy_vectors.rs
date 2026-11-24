use selvedge_mandate_proofs::logic::constants::{MAX_ALLOWED_PAYEES, MAX_ALLOWED_PROGRAMS, MAX_ALLOWED_TOOLS};
use selvedge_mandate_proofs::logic::error::MandateRejection;
use selvedge_mandate_proofs::logic::policy::{
    authorize_agent_rotation, authorize_limit_update, authorize_revoke, authorize_spend, roll_period,
};
use selvedge_mandate_proofs::logic::state::{
    KeyAllowlist, LimitUpdate, MandateState, SpendRequest, ToolAllowlist,
};
use serde_json::{json, Value};

const OWNER: u8 = 1;
const AGENT: u8 = 2;
const SECURITY: u8 = 3;
const STRANGER: u8 = 4;
const TOKEN_PROGRAM: u8 = 10;
const OTHER_PROGRAM: u8 = 11;
const PAYEE_ONE: u8 = 20;
const PAYEE_TWO: u8 = 21;
const START: i64 = 1_800_000_000;
const DAY: i64 = 86_400;
const RANDOM_CASE_COUNT: usize = 240;
const RANDOM_WINDOW_DAYS: u64 = 25;
const RANDOM_SEED: u64 = 0x5eed_1234_abcd_0001;

fn key(byte: u8) -> [u8; 32] {
    [byte; 32]
}

fn key_hex(bytes: &[u8; 32]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn key_list<const CAPACITY: usize>(bytes: &[u8]) -> KeyAllowlist<CAPACITY> {
    let mut entries = [[0u8; 32]; CAPACITY];
    for (entry_index, byte) in bytes.iter().enumerate() {
        entries[entry_index] = key(*byte);
    }
    KeyAllowlist { entries, length: bytes.len() as u8 }
}

fn tool_list(tools: &[u64]) -> ToolAllowlist {
    let mut entries = [0u64; MAX_ALLOWED_TOOLS];
    entries[..tools.len()].copy_from_slice(tools);
    ToolAllowlist { entries, length: tools.len() as u8 }
}

fn base_state() -> MandateState {
    MandateState {
        owner: key(OWNER),
        agent: key(AGENT),
        security_authority: key(SECURITY),
        period_cap: 5_000_000,
        period_seconds: DAY,
        period_start: START,
        spent_in_period: 0,
        expiry: START + 30 * DAY,
        revoked: false,
        nonce: 0,
        allowed_programs: key_list::<MAX_ALLOWED_PROGRAMS>(&[TOKEN_PROGRAM]),
        allowed_payees: key_list::<MAX_ALLOWED_PAYEES>(&[PAYEE_ONE, PAYEE_TWO]),
        allowed_tools: tool_list(&[1, 2]),
    }
}

fn base_request() -> SpendRequest {
    SpendRequest {
        signer: key(AGENT),
        amount: 1_000_000,
        tool_id: 1,
        program: key(TOKEN_PROGRAM),
        payee: key(PAYEE_ONE),
        expected_nonce: 0,
    }
}

fn base_update() -> LimitUpdate {
    LimitUpdate {
        period_cap: 2_000_000,
        period_seconds: DAY,
        expiry: START + 60 * DAY,
        allowed_programs: key_list::<MAX_ALLOWED_PROGRAMS>(&[TOKEN_PROGRAM]),
        allowed_payees: key_list::<MAX_ALLOWED_PAYEES>(&[PAYEE_ONE]),
        allowed_tools: tool_list(&[1]),
    }
}

fn state_json(state: &MandateState) -> Value {
    let programs: Vec<String> = state.allowed_programs.entries[..state.allowed_programs.length as usize].iter().map(key_hex).collect();
    let payees: Vec<String> = state.allowed_payees.entries[..state.allowed_payees.length as usize].iter().map(key_hex).collect();
    let tools: Vec<String> = state.allowed_tools.entries[..state.allowed_tools.length as usize].iter().map(|tool| tool.to_string()).collect();
    json!({
        "owner": key_hex(&state.owner),
        "agent": key_hex(&state.agent),
        "securityAuthority": key_hex(&state.security_authority),
        "periodCap": state.period_cap.to_string(),
        "periodSeconds": state.period_seconds.to_string(),
        "periodStart": state.period_start.to_string(),
        "spentInPeriod": state.spent_in_period.to_string(),
        "expiry": state.expiry.to_string(),
        "revoked": state.revoked,
        "nonce": state.nonce.to_string(),
        "allowedPrograms": programs,
        "allowedPayees": payees,
        "allowedTools": tools,
    })
}

fn request_json(request: &SpendRequest) -> Value {
    json!({
        "signer": key_hex(&request.signer),
        "amount": request.amount.to_string(),
        "toolId": request.tool_id.to_string(),
        "program": key_hex(&request.program),
        "payee": key_hex(&request.payee),
        "expectedNonce": request.expected_nonce.to_string(),
    })
}

fn update_json(update: &LimitUpdate) -> Value {
    let programs: Vec<String> = update.allowed_programs.entries[..update.allowed_programs.length as usize].iter().map(key_hex).collect();
    let payees: Vec<String> = update.allowed_payees.entries[..update.allowed_payees.length as usize].iter().map(key_hex).collect();
    let tools: Vec<String> = update.allowed_tools.entries[..update.allowed_tools.length as usize].iter().map(|tool| tool.to_string()).collect();
    json!({
        "periodCap": update.period_cap.to_string(),
        "periodSeconds": update.period_seconds.to_string(),
        "expiry": update.expiry.to_string(),
        "allowedPrograms": programs,
        "allowedPayees": payees,
        "allowedTools": tools,
    })
}

fn expectation(result: Result<MandateState, MandateRejection>) -> Value {
    match result {
        Ok(state) => json!({ "ok": state_json(&state) }),
        Err(rejection) => json!({ "rejection": format!("{rejection:?}") }),
    }
}

fn spend_case(name: &str, state: MandateState, request: SpendRequest, now: i64) -> Value {
    json!({
        "name": name,
        "operation": "spend",
        "state": state_json(&state),
        "input": request_json(&request),
        "now": now.to_string(),
        "expected": expectation(authorize_spend(&state, &request, now)),
    })
}

fn revoke_case(name: &str, state: MandateState, signer: [u8; 32]) -> Value {
    json!({
        "name": name,
        "operation": "revoke",
        "state": state_json(&state),
        "input": { "signer": key_hex(&signer) },
        "now": START.to_string(),
        "expected": expectation(authorize_revoke(&state, &signer)),
    })
}

fn update_case(name: &str, state: MandateState, signer: [u8; 32], update: LimitUpdate, now: i64) -> Value {
    json!({
        "name": name,
        "operation": "update_limits",
        "state": state_json(&state),
        "input": { "signer": key_hex(&signer), "update": update_json(&update) },
        "now": now.to_string(),
        "expected": expectation(authorize_limit_update(&state, &signer, &update, now)),
    })
}

fn rotate_case(name: &str, state: MandateState, signer: [u8; 32], new_agent: [u8; 32]) -> Value {
    json!({
        "name": name,
        "operation": "rotate_agent",
        "state": state_json(&state),
        "input": { "signer": key_hex(&signer), "newAgent": key_hex(&new_agent) },
        "now": START.to_string(),
        "expected": expectation(authorize_agent_rotation(&state, &signer, &new_agent)),
    })
}

fn roll_case(name: &str, state: MandateState, now: i64) -> Value {
    json!({
        "name": name,
        "operation": "roll_period",
        "state": state_json(&state),
        "input": {},
        "now": now.to_string(),
        "expected": expectation(roll_period(&state, now)),
    })
}

struct Generator(u64);

impl Generator {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
}

fn handwritten_cases() -> Vec<Value> {
    let mut cases = Vec::new();
    let base = base_state();
    let request = base_request();

    cases.push(spend_case("spend within cap", base, request, START));
    cases.push(spend_case("spend exactly at cap", base, SpendRequest { amount: 5_000_000, ..request }, START));
    cases.push(spend_case("spend cap plus one", base, SpendRequest { amount: 5_000_001, ..request }, START));
    cases.push(spend_case("spend zero amount", base, SpendRequest { amount: 0, ..request }, START));
    cases.push(spend_case("spend by stranger", base, SpendRequest { signer: key(STRANGER), ..request }, START));
    cases.push(spend_case("spend by owner", base, SpendRequest { signer: key(OWNER), ..request }, START));
    cases.push(spend_case("spend stale nonce", base, SpendRequest { expected_nonce: 1, ..request }, START));
    cases.push(spend_case("spend unlisted program", base, SpendRequest { program: key(OTHER_PROGRAM), ..request }, START));
    cases.push(spend_case("spend unlisted payee", base, SpendRequest { payee: key(STRANGER), ..request }, START));
    cases.push(spend_case("spend unlisted tool", base, SpendRequest { tool_id: 99, ..request }, START));
    cases.push(spend_case("spend second tool", base, SpendRequest { tool_id: 2, ..request }, START));
    cases.push(spend_case("spend at expiry", base, request, base.expiry));
    cases.push(spend_case("spend one second before expiry", base, request, base.expiry - 1));
    let revoked = MandateState { revoked: true, ..base };
    cases.push(spend_case("spend revoked", revoked, request, START));
    let nearly_full = MandateState { spent_in_period: 4_000_000, nonce: 3, ..base };
    cases.push(spend_case("spend cumulative reaches cap", nearly_full, SpendRequest { amount: 1_000_000, expected_nonce: 3, ..request }, START + 10));
    cases.push(spend_case("spend cumulative exceeds cap", nearly_full, SpendRequest { amount: 1_000_001, expected_nonce: 3, ..request }, START + 10));
    cases.push(spend_case("spend last second of period", nearly_full, SpendRequest { amount: 1_000_001, expected_nonce: 3, ..request }, START + DAY - 1));
    cases.push(spend_case("spend first second of next period", nearly_full, SpendRequest { amount: 5_000_000, expected_nonce: 3, ..request }, START + DAY));
    cases.push(spend_case("spend after skipped periods", nearly_full, SpendRequest { amount: 10, expected_nonce: 3, ..request }, START + 3 * DAY + 500));
    let saturated = MandateState { period_cap: u64::MAX, spent_in_period: u64::MAX, ..base };
    cases.push(spend_case("spend overflow", saturated, SpendRequest { amount: 1, ..request }, START));
    let nonce_saturated = MandateState { nonce: u64::MAX, ..base };
    cases.push(spend_case("spend nonce overflow", nonce_saturated, SpendRequest { expected_nonce: u64::MAX, ..request }, START));
    let period_overflow = MandateState { period_start: i64::MAX - 10, period_seconds: DAY, expiry: i64::MAX, ..base };
    cases.push(spend_case("spend period end overflow", period_overflow, request, START));

    cases.push(revoke_case("revoke by owner", base, key(OWNER)));
    cases.push(revoke_case("revoke by security authority", base, key(SECURITY)));
    cases.push(revoke_case("revoke by agent", base, key(AGENT)));
    cases.push(revoke_case("revoke by stranger", base, key(STRANGER)));
    cases.push(revoke_case("revoke twice", revoked, key(OWNER)));

    let update = base_update();
    cases.push(update_case("update by owner", base, key(OWNER), update, START));
    cases.push(update_case("update by agent", base, key(AGENT), update, START));
    cases.push(update_case("update by security authority", base, key(SECURITY), update, START));
    cases.push(update_case("update revoked", revoked, key(OWNER), update, START));
    cases.push(update_case("update zero cap", base, key(OWNER), LimitUpdate { period_cap: 0, ..update }, START));
    cases.push(update_case("update period too short", base, key(OWNER), LimitUpdate { period_seconds: 59, ..update }, START));
    cases.push(update_case("update period too long", base, key(OWNER), LimitUpdate { period_seconds: 31_536_001, ..update }, START));
    cases.push(update_case("update expiry in past", base, key(OWNER), LimitUpdate { expiry: START, ..update }, START));
    cases.push(update_case("update empty tools", base, key(OWNER), LimitUpdate { allowed_tools: tool_list(&[]), ..update }, START));
    cases.push(update_case("update cap below spent", nearly_full, key(OWNER), LimitUpdate { period_cap: 3_999_999, ..update }, START + 10));
    cases.push(update_case("update cap equal to spent", nearly_full, key(OWNER), LimitUpdate { period_cap: 4_000_000, ..update }, START + 10));
    cases.push(update_case("update after period ended allows lower cap", nearly_full, key(OWNER), LimitUpdate { period_cap: 100, ..update }, START + DAY + 5));

    cases.push(rotate_case("rotate by owner", base, key(OWNER), key(STRANGER)));
    cases.push(rotate_case("rotate by agent", base, key(AGENT), key(STRANGER)));
    cases.push(rotate_case("rotate to owner", base, key(OWNER), key(OWNER)));
    cases.push(rotate_case("rotate to null key", base, key(OWNER), [0u8; 32]));
    cases.push(rotate_case("rotate revoked", revoked, key(OWNER), key(STRANGER)));
    cases.push(rotate_case("rotate nonce overflow", nonce_saturated, key(OWNER), key(STRANGER)));

    cases.push(roll_case("roll inside period", nearly_full, START + 100));
    cases.push(roll_case("roll at period end", nearly_full, START + DAY));
    cases.push(roll_case("roll after five periods", nearly_full, START + 5 * DAY + 7));
    cases.push(roll_case("roll with zero period", MandateState { period_seconds: 0, ..base }, START));
    cases
}

fn random_cases() -> Vec<Value> {
    let mut generator = Generator(RANDOM_SEED);
    let mut cases = Vec::new();
    for case_index in 0..RANDOM_CASE_COUNT {
        let mut state = base_state();
        state.spent_in_period = generator.next() % 6_000_000;
        state.nonce = generator.next() % 4;
        state.period_start = START - (generator.next() % (2 * DAY as u64)) as i64;
        state.revoked = generator.next() % 11 == 0;
        let mut request = base_request();
        request.amount = generator.next() % 6_000_000;
        request.expected_nonce = if generator.next() % 7 == 0 { generator.next() % 4 } else { state.nonce };
        request.tool_id = [1u64, 1, 2, 2, 3][(generator.next() % 5) as usize];
        request.payee = key([PAYEE_ONE, PAYEE_ONE, PAYEE_TWO, PAYEE_TWO, STRANGER][(generator.next() % 5) as usize]);
        request.signer = key([AGENT, AGENT, AGENT, AGENT, AGENT, OWNER][(generator.next() % 6) as usize]);
        let now = START + (generator.next() % (RANDOM_WINDOW_DAYS * DAY as u64)) as i64;
        cases.push(spend_case(&format!("random spend {case_index}"), state, request, now));
    }
    cases
}

fn main() {
    let mut cases = handwritten_cases();
    cases.extend(random_cases());
    let document = json!({
        "schema": "selvedge-policy-vectors",
        "version": 1,
        "generatedBy": "programs/mandate/proofs/examples/generate_policy_vectors.rs",
        "cases": cases,
    });
    println!("{}", serde_json::to_string_pretty(&document).expect("vectors serialise"));
}
