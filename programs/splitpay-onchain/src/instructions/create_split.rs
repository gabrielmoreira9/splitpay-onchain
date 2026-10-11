use crate::error::SplitError;
use anchor_lang::prelude::*;
use crate::state::{Participant, SplitAccount, MAX_PARTICIPANTS};

#[derive(Accounts)]
#[instruction(split_id: u64)]
pub struct CreateSplit<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + SplitAccount::INIT_SPACE,
        seeds = [
            b"split",
            creator.key().as_ref(),
            &split_id.to_le_bytes()
        ],
        bump
    )]
    pub split: Account<'info, SplitAccount>,

    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: This account is used only as the recipient public key.
    /// No account data is read or modified.
    pub recipient: UncheckedAccount<'info>,

    pub mint: Account<'info, anchor_spl::token::Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_split(
    ctx: Context<CreateSplit>,
    split_id: u64,
    total_amount: u64,
    participants: Vec<Participant>,
) -> Result<()> {
    require!(
        !participants.is_empty() && participants.len() <= MAX_PARTICIPANTS,
        SplitError::InvalidParticipants
    );

    require!(total_amount > 0, SplitError::InvalidAmount);

    let mut sum = 0u64;

    for (i, participant) in participants.iter().enumerate() {
        require!(participant.amount > 0, SplitError::InvalidAmount);
        require!(!participant.paid, SplitError::AlreadyPaid);

        for other in participants.iter().skip(i + 1) {
            require!(
                participant.wallet != other.wallet,
                SplitError::DuplicateParticipant
            );
        }

        sum = sum.checked_add(participant.amount)
            .ok_or(SplitError::InvalidAmount)?;
    }

    require!(sum == total_amount, SplitError::InvalidAmount);

    let split = &mut ctx.accounts.split;

    split.creator = ctx.accounts.creator.key();
    split.recipient = ctx.accounts.recipient.key();
    split.mint = ctx.accounts.mint.key();
    split.split_id = split_id;
    split.total_amount = total_amount;
    split.participants = participants;
    split.bump = ctx.bumps.split;

    Ok(())
}
