pub mod constants;
pub mod convert;
pub mod error;
pub mod events;
pub mod instructions;
pub mod logic;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use convert::LimitParams;
pub use instructions::*;
pub use state::*;

declare_id!("DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd");

#[program]
pub mod selvedge_mandate {
    use super::*;

    pub fn create_mandate(
        context: Context<CreateMandate>,
        mandate_id: u64,
        agent: Pubkey,
        security_authority: Pubkey,
        mint: Pubkey,
        params: LimitParams,
    ) -> Result<()> {
        instructions::create_mandate::handle_create_mandate(
            context,
            mandate_id,
            agent,
            security_authority,
            mint,
            params,
        )
    }

    pub fn update_limits(context: Context<UpdateLimits>, params: LimitParams) -> Result<()> {
        instructions::update_limits::handle_update_limits(context, params)
    }

    pub fn revoke_mandate(context: Context<RevokeMandate>) -> Result<()> {
        instructions::revoke_mandate::handle_revoke_mandate(context)
    }

    pub fn rotate_agent(context: Context<RotateAgent>, new_agent: Pubkey) -> Result<()> {
        instructions::rotate_agent::handle_rotate_agent(context, new_agent)
    }

    pub fn spend(
        context: Context<Spend>,
        amount: u64,
        tool_id: u64,
        expected_nonce: u64,
    ) -> Result<()> {
        instructions::spend::handle_spend(context, amount, tool_id, expected_nonce)
    }

    pub fn close_mandate(context: Context<CloseMandate>) -> Result<()> {
        instructions::close_mandate::handle_close_mandate(context)
    }
}
