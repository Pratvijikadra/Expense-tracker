from fastapi import APIRouter, HTTPException, status
from bson import ObjectId
from typing import List
from backend.schema import ExpenseCreateSchema, ExpenseResponseSchema  
from backend.database import expense_collection, expense_helper
from datetime import datetime, date
from fastapi import Depends
from backend.routes.auth import get_current_user_from_cookie

router = APIRouter()


def verify_api_auth(current_user):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated. Please login.")




# 1. ADD EXPENSE WITH USER ID
@router.post("/", response_model=ExpenseResponseSchema)
def add_expense(expense_data: ExpenseCreateSchema, current_user=Depends(get_current_user_from_cookie)):
    verify_api_auth(current_user)
    
    expense_dict = expense_data.model_dump()
    expense_dict["expense_date"] = str(expense_dict["expense_date"])
    expense_dict["user_id"] = current_user["sub"] # Inject current user's ID
    expense_dict["is_recurring"] = bool(expense_dict.get("is_recurring", False))
    
    new_expense = expense_collection.insert_one(expense_dict)
    created_expense = expense_collection.find_one({"_id": new_expense.inserted_id})
    return expense_helper(created_expense)

# 2. GET ONLY LOGGED-IN USER'S EXPENSES
@router.get("/", response_model=List[ExpenseResponseSchema])
def get_expenses(current_user=Depends(get_current_user_from_cookie)):
    verify_api_auth(current_user)
    
    expenses = []
    # Filter with current logged-in user's id
    for expense in expense_collection.find({"user_id": current_user["sub"]}):
        expenses.append(expense_helper(expense))
    return expenses

# 3. UPDATE ONLY OWNER'S EXPENSE
@router.put("/{id}", response_model=ExpenseResponseSchema)
def update_expense(id: str, expense_data: ExpenseCreateSchema, current_user=Depends(get_current_user_from_cookie)):
    verify_api_auth(current_user)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid ID")
        
    # Check if this expense belongs to the current user
    expense = expense_collection.find_one({"_id": ObjectId(id), "user_id": current_user["sub"]})
    if not expense:
        raise HTTPException(status_code=403, detail="Not authorized to edit this expense")
        
    updated_dict = expense_data.model_dump()
    updated_dict["expense_date"] = str(updated_dict["expense_date"])
    updated_dict["user_id"] = current_user["sub"]
    
    expense_collection.update_one({"_id": ObjectId(id)}, {"$set": updated_dict})
    return expense_helper(expense_collection.find_one({"_id": ObjectId(id)}))

# 4. DELETE ONLY OWNER'S EXPENSE
@router.delete("/{id}")
def delete_expense(id: str, current_user=Depends(get_current_user_from_cookie)):
    verify_api_auth(current_user)
    if not ObjectId.is_valid(id):
        raise HTTPException(status_code=400, detail="Invalid ID")
        
    delete_result = expense_collection.delete_one({"_id": ObjectId(id), "user_id": current_user["sub"]})
    if delete_result.deleted_count == 1:
        return {"message": "Deleted successfully"}
    raise HTTPException(status_code=404, detail="Expense not found or unauthorized")

# 5. USER-CENTRIC MONTHLY ANALYTICS ENGINE
@router.get("/analytics/summary")
def get_analytics(current_user=Depends(get_current_user_from_cookie)):
    verify_api_auth(current_user)
    
    today = date.today()
    current_year = today.year
    current_month = today.month

    if current_month == 1:
        prev_month = 12
        prev_year = current_year - 1
    else:
        prev_month = current_month - 1
        prev_year = current_year

    current_month_str = f"{current_year}-{str(current_month).zfill(2)}"
    prev_month_str = f"{prev_year}-{str(prev_month).zfill(2)}"

    # Fetch expenses ONLY for this user
    all_expenses = list(expense_collection.find({"user_id": current_user["sub"]}))
    current_month_total = 0.0
    prev_month_total = 0.0
    category_data = {}

    for exp in all_expenses:
        exp_date_str = exp.get("expense_date", "")
        amount = float(exp.get("amount", 0))
        
        if exp_date_str.startswith(current_month_str):
            current_month_total += amount
            cat = exp.get("category", "General")
            category_data[cat] = category_data.get(cat, 0) + amount
        elif exp_date_str.startswith(prev_month_str):
            prev_month_total += amount

    percentage_growth = 0.0
    if prev_month_total > 0:
        percentage_growth = ((current_month_total - prev_month_total) / prev_month_total) * 100
    elif prev_month_total == 0 and current_month_total > 0:
        percentage_growth = 100.0

    return {
        "current_month_total": current_month_total,
        "prev_month_total": prev_month_total,
        "percentage_growth": round(percentage_growth, 2),
        "category_breakdown": category_data
    }