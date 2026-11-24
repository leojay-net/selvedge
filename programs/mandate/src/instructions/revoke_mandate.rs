use anchor_lang::prelude::*;

use crate::constants::MANDATE_SEED;
use crate::convert::{rejection_to_error, state_from_account, write_state_to_account};
use crate::events::MandateRevoked;
use crate::logic::policy::authorize_revoke;
use crate::state::Mandate;

#[derive(Accounts)]
pub struct RevokeMandate<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [MANDATE_SEED, mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()],
        bump = mandate.bump
    )]
    pub mandate: Account<'info, Mandate>,
}

pub fn handle_revoke_mandate(context: Context<RevokeMandate>) -> Result<()> {
    let mandate_address = context.accounts.mandate.key();
    let signer_address = context.accounts.signer.key();
    let mandate = &mut context.accounts.mandate;
    let next_state = authorize_revoke(&state_from_account(mandate), &signer_address.to_bytes())
        .map_err(rejection_to_error)?;
    write_state_to_account(mandate, &next_state);

    emit!(MandateRevoked {
        mandate: mandate_address,
        revoked_by: signer_address,
    });
    Ok(())
}
