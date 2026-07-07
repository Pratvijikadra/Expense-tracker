from fastapi import APIRouter, HTTPException, Depends
from backend.database import db
from backend.routes.auth import get_current_user_from_cookie
from bson import ObjectId
router = APIRouter(prefix="/admin-api", tags=["Admin Operations"])

@router.get("/metrics")
def get_system_metrics(current_user=Depends(get_current_user_from_cookie)):
    # Security Layer: Confirm the session role
    if not current_user or current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin privileges required.")

   
    users_collection = db["users"]
    expenses_collection = db["expenses"]

    users = list(users_collection.find())
    expenses = list(expenses_collection.find())

    # Direct float mapping to avoid parsing layout crashes
    total_spent = 0.0
    for e in expenses:
        try:
            total_spent += float(e.get("amount", 0))
        except (ValueError, TypeError):
            continue

    user_list = []
    for u in users:
        user_list.append({
            "id": str(u["_id"]),
            "username": u.get("username", "Unknown"),
            "email": u.get("email", "No Email"),
            "budget": u.get("budget", 0.0),
            "role": u.get("role", "user")
        })

    return {
        "total_users": len(user_list),
        "total_system_expenses": total_spent,
        "users": user_list
    }

@router.delete("/delete-user/{user_id}")
def delete_user_account(user_id: str, current_user=Depends(get_current_user_from_cookie)):
    if not current_user or current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied.")
        

    
    # Remove user account configuration
    db["users"].delete_one({"_id": ObjectId(user_id)})
    # Clean and flush user's expense rows safely
    db["expenses"].delete_many({"user_id": user_id})
    
    return {"status": "success", "message": "Account wiped completely."}