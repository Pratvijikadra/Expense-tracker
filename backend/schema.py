from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional

# 1. Frontend se Expense add karte waqt jo data chahiye
class ExpenseCreateSchema(BaseModel):
    amount: float = Field(..., gt=0, description="Amount 0 se bada hona chahiye")
    category: str = Field(..., min_length=2)
    payment_mode: str = Field(..., description="e.g., Cash, UPI, Credit Card")
    expense_date: date
    description: Optional[str] = None
    is_recurring: Optional[bool] = False

# 2. Database se response dete waqt jo data dikhega
class ExpenseResponseSchema(ExpenseCreateSchema):
    id: str

    class Config:
        json_schema_extra = {
            "example": {
                "id": "60c72b2f9b1d8b2bad7f5b3a",
                "amount": 500.0,
                "category": "Food",
                "payment_mode": "UPI",
                "expense_date": "2026-06-26",
                "description": "Lunch with team"
            }
        }




class UserSignupSchema(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)
    email: str
    password: str = Field(..., min_length=6)

class UserLoginSchema(BaseModel):
    email: str
    password: str




class SavingsGoalSchema(BaseModel):
    username: str
    user_id: Optional[str] = None
    goal_name: str
    target_amount: float
    current_amount: float = 0
    target_date: str
    
    


class DeleteAccountRequest(BaseModel):
    password: str