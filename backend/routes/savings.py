





from fastapi import APIRouter, HTTPException
from backend.database import db
from backend.schema import SavingsGoalSchema
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from fastapi import Depends
from backend.routes.auth import get_current_user_from_cookie
from pydantic import BaseModel, Field
from typing import Optional


router = APIRouter(prefix="/savings", tags=["Savings"])

collection = db["savings_goals"]


goal_collection = db["savings_goals"]
expense_collection = db["expenses"]
user_collection = db["users"]
transfer_collection = db["savings_transfer_log"]
transaction_collection = db["savings_transactions"]

# Partial update schema — sirf editable fields
class GoalUpdateSchema(BaseModel):
    goal_name: str
    target_amount: float
    current_amount: Optional[float] = None  # Optional — frontend se nahi bheja toh DB mein change nahi hoga
    target_date: str


# Create Goal API
@router.post("/")
def create_goal(goal: SavingsGoalSchema, current_user=Depends(get_current_user_from_cookie)):

    # Use JWT user_id if available, else use what was sent
    user_id = current_user["sub"] if current_user else goal.user_id
    username = current_user["username"] if current_user else goal.username

    existing = collection.find_one(
        {
            "username": username,
            "goal_name": goal.goal_name
        }
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Goal already exists."
        )


    goal_data = goal.dict()

    # Inject user_id and username from JWT token (trusted source)
    goal_data["user_id"] = user_id
    goal_data["username"] = username

    # Auto-Inject current timestamp into the dictionary
    goal_data["created_at"] = datetime.now().strftime("%Y-%m-%d")

    collection.insert_one(goal_data)
    

    return {
        "message": "Savings goal created successfully."
    }




#Get Savings Goal
@router.get("/{username}")
def get_goal(username: str):

    goal = collection.find_one(
        {"username": username},
        {"_id": 0}
    )

    if not goal:
        raise HTTPException(
            status_code=404,
            detail="No savings goal found."
        )

    return goal




# Update Goal API — sirf editable fields accept karta hai
@router.put("/{username}")
def update_goal(
    username: str,
    goal: GoalUpdateSchema,
    current_user=Depends(get_current_user_from_cookie)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required.")

    # Sirf wahi fields update karo jo provide ki gayi hain
    update_fields = {
        "goal_name": goal.goal_name,
        "target_amount": goal.target_amount,
        "target_date": goal.target_date,
    }
    # current_amount sirf tabhi update ho jab frontend ne bheja ho
    if goal.current_amount is not None:
        update_fields["current_amount"] = goal.current_amount

    result = collection.update_one(
        {"username": username},
        {"$set": update_fields}
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Goal not found."
        )

    return {
        "message": "Goal updated successfully."
    }






#delete goal API
@router.delete("/{username}")
def delete_goal(username: str, current_user=Depends(get_current_user_from_cookie)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required.")

    result = collection.delete_one(
        {"username": username}
    )

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Goal not found."
        )

    return {
        "message": "Goal deleted successfully."
    }






# Deposit API




class DepositRequest(BaseModel):
    amount: float = Field(..., gt=0, description="The amount of money to deposit. Must be greater than 0.")

@router.put("/deposit/{username}")
def deposit_money(username: str, data: DepositRequest): # 2. Yahan 'dict' ki jagah schema use karein

    # 3. data.get() ki jagah ab aap direct object attribute use kar sakte hain
    amount = data.amount 

    # Note: Pydantic ka 'gt=0' (greater than 0) apne aap 422 Unprocessable Entity error de dega 
    # agar amount 0 ya negative hua. Par agar aapko strict 400 bad request hi chahiye:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount.")

    goal = collection.find_one({"username": username})

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")

    collection.update_one(
        {"username": username},
        {
            "$inc": {
                "current_amount": amount
            }
        }
    )

    transaction_collection.insert_one({
    "username": username,
    "type": "Deposit",
    "amount": amount,
    "date": datetime.now().strftime("%d-%m-%Y %H:%M")
})

    return {
        "message": "Money deposited successfully."
    }






# Withdraw API


class WithdrawRequest(BaseModel):
    amount: float = Field(..., gt=0, description="The amount of money to withdraw. Must be greater than 0.")

@router.put("/withdraw/{username}")
def withdraw_money(username: str, data: WithdrawRequest):

    amount = data.amount

    goal = collection.find_one({"username": username})

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")

    current_balance = goal.get("current_amount", 0)

    if amount > current_balance:
        raise HTTPException(
            status_code=400,
            detail="Insufficient Piggy Bank balance."
        )

    collection.update_one(
        {"username": username},
        {
            "$inc": {
                "current_amount": -amount
            }
        }
    )

    transaction_collection.insert_one({
    "username": username,
    "type": "Withdraw",
    "amount": amount,
    "date": datetime.now().strftime("%d-%m-%Y %H:%M")
})

    return {
        "message": "Money withdrawn successfully."
    }








# auto transfer money from budget to piggy bank at the end of month if money remains

@router.post("/auto-transfer")
def auto_transfer(current_user=Depends(get_current_user_from_cookie)):

    if not current_user:
        raise HTTPException(status_code=401, detail="Login required.")

    username = current_user["username"]
    user_id = current_user["sub"]
    print("JWT User ID:", user_id)

    today = datetime.now()
    # today = datetime(2026, 8, 15)
    

    previous_month = today.replace(day=1) - relativedelta(months=1)

    month = previous_month.month
    year = previous_month.year

    already = transfer_collection.find_one({
        "user_id": user_id,
        "username": username,
        "month": month,
        "year": year
    })

    if already:
        return {
            "transferred": False
        }

    user = user_collection.find_one({
        "username": username
    })

    if not user:
        return {
            "transferred": False
        }

    budget = float(user.get("budget", 0))

    if budget <= 0:
        return {
            "transferred": False
        }

    month_prefix = f"{year}-{str(month).zfill(2)}"

    print("Searching Month:", month_prefix)

    expenses = list(expense_collection.find({
        "user_id": user_id,
        "expense_date": {
            "$regex": f"^{month_prefix}"
        }
    }))

    print("Expenses Found:", expenses)

    if len(expenses) == 0:
        print(f"ℹ️ Skipping auto-transfer for {username}. No expenses found for privious month).")
        return {
            "transferred": False,
            "reason": "New or inactive user. No expenses recorded for the previous month."
        }

    total = sum(exp["amount"] for exp in expenses)

    print("Budget:", budget)
    print("Total Expense:", total)
    print("Remaining:", budget - total)

    remaining = budget - total

    if remaining <= 0:
        return {
            "transferred": False,
            "reason": f"Remaining <= 0 (Budget={budget}, Expense={total})"
        }

    goal = goal_collection.find_one(
        {"user_id": user_id}
    )

    # Fallback: purane goals jisme user_id nahi save hua tha
    if not goal:
        goal = goal_collection.find_one({"username": username})

    if not goal:
        return {
            "transferred": False,
            "reason": "No savings goal found for this user."
        }

    goal_collection.update_one(
        {
            "_id": goal["_id"]  # _id se update karo — guaranteed match for both old and new goals
        },
        {
            "$inc": {
                "current_amount": remaining
            }
        }
    )

    transfer_collection.insert_one({
        "user_id": user_id,
        "username": username,
        "month": month,
        "year": year,
        "amount": remaining,
        "transfer_date": datetime.now()
    })

    transaction_collection.insert_one({
    "username": username,
    "type": "Auto Transfer",
    "amount": remaining,
    "date": datetime.now().strftime("%d-%m-%Y %H:%M")
})

    return {
        "transferred": True,
        "amount": remaining
    }




@router.get("/transactions/{username}")
def get_transactions(username: str):

    transactions = list(
        transaction_collection.find(
            {"username": username},
            {"_id": 0}
        ).sort("date", -1)
    )

    return transactions