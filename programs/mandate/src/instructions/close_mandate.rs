use anchor_lang::prelude::*;

use crate::constants::MANDATE_SEED;
use crate::events::MandateClosed;
use crate::state::Mandate;

#[derive(Accounts)]
pub struct CloseMandate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [MANDATE_SEED, mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()],
        bump = mandate.bump
    )]
    pub mandate: Account<'info, Mandate>,
}

pub fn handle_close_mandate(context: Context<CloseMandate>) -> Result<()> {
    emit!(MandateClosed {
        mandate: context.accounts.mandate.key(),
    });
    Ok(())
}
