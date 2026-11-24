use anchor_lang::prelude::*;

use crate::constants::MANDATE_SEED;
use crate::convert::{rejection_to_error, state_from_account, write_state_to_account};
use crate::events::AgentRotated;
use crate::logic::policy::authorize_agent_rotation;
use crate::state::Mandate;

#[derive(Accounts)]
pub struct RotateAgent<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [MANDATE_SEED, mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()],
        bump = mandate.bump
    )]
    pub mandate: Account<'info, Mandate>,
}

pub fn handle_rotate_agent(context: Context<RotateAgent>, new_agent: Pubkey) -> Result<()> {
    let mandate_address = context.accounts.mandate.key();
    let signer_bytes = context.accounts.signer.key().to_bytes();
    let mandate = &mut context.accounts.mandate;
    let previous_agent = mandate.agent;
    let next_state = authorize_agent_rotation(
        &state_from_account(mandate),
        &signer_bytes,
        &new_agent.to_bytes(),
    )
    .map_err(rejection_to_error)?;
    write_state_to_account(mandate, &next_state);

    emit!(AgentRotated {
        mandate: mandate_address,
        previous_agent,
        new_agent,
    });
    Ok(())
}
