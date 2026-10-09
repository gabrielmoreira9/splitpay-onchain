
use anchor_lang::prelude::*;

#[error_code]
pub enum SplitError {
    #[msg("Invalid number of participants")]
    InvalidParticipants,

    #[msg("Invalid payment amount")]
    InvalidAmount,

    #[msg("Participant has already paid")]
    AlreadyPaid,

    #[msg("Duplicate participant wallet")]
    DuplicateParticipant,
}
