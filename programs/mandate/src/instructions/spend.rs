use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::MANDATE_SEED;
use crate::convert::{rejection_to_error, state_from_account, write_state_to_account};
use crate::error::MandateError;
use crate::events::SpendAuthorized;
use crate::logic::policy::authorize_spend;
use crate::logic::state::SpendRequest;
use crate::state::Mandate;

#[derive(Accounts)]
pub struct Spend<'info> {
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [MANDATE_SEED, mandate.owner.as_ref(), &mandate.mandate_id.to_le_bytes()],
        bump = mandate.bump
    )]
    pub mandate: Account<'info, Mandate>,
    #[account(address = mandate.mint)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        constraint = owner_token_account.owner == mandate.owner @ MandateError::TokenAccountOwnerMismatch
    )]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint)]
    pub payee_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_spend(
    context: Context<Spend>,
    amount: u64,
    tool_id: u64,
    expected_nonce: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let request = SpendRequest {
        signer: context.accounts.agent.key().to_bytes(),
        amount,
        tool_id,
        program: context.accounts.token_program.key().to_bytes(),
        payee: context.accounts.payee_token_account.owner.to_bytes(),
        expected_nonce,
    };
    let mandate_address = context.accounts.mandate.key();
    let next_state = authorize_spend(
        &state_from_account(&context.accounts.mandate),
        &request,
        now,
    )
    .map_err(rejection_to_error)?;

    let owner_key = context.accounts.mandate.owner;
    let mandate_id_bytes = context.accounts.mandate.mandate_id.to_le_bytes();
    let bump_seed = [context.accounts.mandate.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[
        MANDATE_SEED,
        owner_key.as_ref(),
        &mandate_id_bytes,
        &bump_seed,
    ]];

    transfer_checked(
        CpiContext::new_with_signer(
            context.accounts.token_program.key(),
            TransferChecked {
                from: context.accounts.owner_token_account.to_account_info(),
                mint: context.accounts.mint.to_account_info(),
                to: context.accounts.payee_token_account.to_account_info(),
                authority: context.accounts.mandate.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        context.accounts.mint.decimals,
    )?;

    let payee = context.accounts.payee_token_account.owner;
    let mandate = &mut context.accounts.mandate;
    write_state_to_account(mandate, &next_state);
    emit!(SpendAuthorized {
        mandate: mandate_address,
        payee,
        tool_id,
        amount,
        spent_in_period: mandate.spent_in_period,
        nonce: mandate.nonce,
    });
    Ok(())
}
