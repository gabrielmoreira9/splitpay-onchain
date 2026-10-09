use anchor_lang::prelude::*;

pub const MAX_PARTICIPANTS: usize = 10;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Participant {
    pub wallet: Pubkey,
    pub amount: u64,
    pub paid: bool,
}

#[account]
#[derive(InitSpace)]
pub struct SplitAccount {
    pub creator: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub split_id: u64,
    pub total_amount: u64,
    #[max_len(10)]
    pub participants: Vec<Participant>,
    pub bump: u8,
}

