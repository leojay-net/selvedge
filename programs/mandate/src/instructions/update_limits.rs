use anchor_lang::prelude::*;

use crate::constants::MANDATE_SEED;
use crate::convert::{
    limit_update_from_params, rejection_to_error, state_from_account, write_state_to_account,
    LimitParams,
};
use crate::events::LimitsUpdated;
use crate::logic::policy::authorize_limit_update;
use crate::state::Mandate;

#[derive(Accounts)]
pub struct UpdateLimits<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [MANDATE_SEED, mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()],
        bump = mandate.bump
    )]
    pub mandate: Account<'info, Mandate>,
}

pub fn handle_update_limits(context: Context<UpdateLimits>, params: LimitParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let update = limit_update_from_params(&params).map_err(rejection_to_error)?;
    let mandate_address = context.accounts.mandate.key();
    let signer_bytes = context.accounts.signer.key().to_bytes();
    let mandate = &mut context.accounts.mandate;
    let next_state =
        authorize_limit_update(&state_from_account(mandate), &signer_bytes, &update, now)
            .map_err(rejection_to_error)?;
    write_state_to_account(mandate, &next_state);

    emit!(LimitsUpdated {
        mandate: mandate_address,
        period_cap: mandate.period_cap,
        period_seconds: mandate.period_seconds,
        expiry: mandate.expiry,
    });
    Ok(())
}
