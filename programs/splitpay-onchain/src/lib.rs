
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;
pub use state::*;

declare_id!("Akpk2C1ADPSGhECkh3Ejwh7Sk17qzDAA2wY7sqPz76AZ");

#[program]
pub mod splitpay_onchain {
    use super::*;

    pub fn create_split(
        ctx: Context<CreateSplit>,
        split_id: u64,
        total_amount: u64,
        participants: Vec<Participant>,
    ) -> Result<()> {
        instructions::create_split::handle_create_split(
            ctx,
            split_id,
            total_amount,
            participants,
        )
    }
}

