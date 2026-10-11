
use anchor_lang::prelude::*;
use anchor_spl::token::{
    self, Mint, Token, TokenAccount, Transfer,
};

use crate::error::SplitError;
use crate::state::SplitAccount;

#[derive(Accounts)]
pub struct PayShare<'info> {
    #[account(
        mut,
        seeds = [
            b"split",
            split.creator.as_ref(),
            &split.split_id.to_le_bytes()
        ],
        bump = split.bump
    )]
    pub split: Account<'info, SplitAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        constraint = payer_token.owner == payer.key(),
        constraint = payer_token.mint == split.mint
    )]
    pub payer_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = recipient_token.owner == split.recipient,
        constraint = recipient_token.mint == split.mint
    )]
    pub recipient_token: Account<'info, TokenAccount>,

    #[account(address = split.mint)]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}
pub fn handle_pay_share(ctx: Context<PayShare>) -> Result<()> {
    let split = &mut ctx.accounts.split;
    let payer = ctx.accounts.payer.key();

    let participant = split
        .participants
        .iter_mut()
        .find(|p| p.wallet == payer)
        .ok_or(SplitError::InvalidParticipants)?;

    require!(!participant.paid, SplitError::AlreadyPaid);

    let amount = participant.amount;

    let cpi_accounts = Transfer {
        from: ctx.accounts.payer_token.to_account_info(),
        to: ctx.accounts.recipient_token.to_account_info(),
        authority: ctx.accounts.payer.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.key(),
        cpi_accounts,
    );

    token::transfer(cpi_ctx, amount)?;

    participant.paid = true;

    Ok(())
}
