use anchor_lang::prelude::*;

use crate::constants::MANDATE_SEED;
use crate::convert::{
    limit_update_from_params, rejection_to_error, write_state_to_account, LimitParams,
};
use crate::events::MandateCreated;
use crate::logic::constants::MANDATE_VERSION;
use crate::logic::policy::build_initial_state;
use crate::state::Mandate;

#[derive(Accounts)]
#[instruction(mandate_id: u64)]
pub struct CreateMandate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Mandate::INIT_SPACE,
        seeds = [MANDATE_SEED, owner.key().as_ref(), &mandate_id.to_le_bytes()],
        bump
    )]
    pub mandate: Account<'info, Mandate>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_mandate(
    context: Context<CreateMandate>,
    mandate_id: u64,
    agent: Pubkey,
    security_authority: Pubkey,
    mint: Pubkey,
    params: LimitParams,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let update = limit_update_from_params(&params).map_err(rejection_to_error)?;
    let initial_state = build_initial_state(
        &context.accounts.owner.key().to_bytes(),
        &agent.to_bytes(),
        &security_authority.to_bytes(),
        &update,
        now,
    )
    .map_err(rejection_to_error)?;

    let mandate_address = context.accounts.mandate.key();
    let mandate = &mut context.accounts.mandate;
    mandate.version = MANDATE_VERSION;
    mandate.bump = context.bumps.mandate;
    mandate.mandate_id = mandate_id;
    mandate.mint = mint;
    write_state_to_account(mandate, &initial_state);

    emit!(MandateCreated {
        mandate: mandate_address,
        owner: mandate.owner,
        agent: mandate.agent,
        period_cap: mandate.period_cap,
        expiry: mandate.expiry,
    });
    Ok(())
}
