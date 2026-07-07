from fastapi import FastAPI, HTTPException, Request, Form
from backend.database import expense_collection
from backend.routes.expense import router as expense_router
from bson.objectid import ObjectId
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from backend.routes.auth import router as auth_router
from fastapi import Depends
from backend.routes.auth import get_current_user_from_cookie
from datetime import datetime
from backend.database import db
from backend.routes import admin_api , savings

# from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://127.0.0.1:8000",
#         "http://localhost:8000"],  # Sabhi origins ko allow karne ke liye
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


app.mount("/static", StaticFiles(directory="frontend"), name="static")
templates = Jinja2Templates(directory="frontend/templates")

# @app.get("/", response_class=HTMLResponse)
# def home(request:Request):
#     return templates.TemplateResponse(request=request, name='index.html')


app.include_router(expense_router, prefix="/expense", tags=["Expense"])
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(admin_api.router)
app.include_router(savings.router)





@app.get("/", response_class=HTMLResponse)
def home(request: Request, current_user=Depends(get_current_user_from_cookie)):
    if not current_user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(request, "index.html", {"username": current_user["username"]})

@app.get("/manage", response_class=HTMLResponse)
def manage_page(request: Request, current_user=Depends(get_current_user_from_cookie)):
    if not current_user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(request, "manage.html", {"username": current_user["username"]})

@app.get("/analytics", response_class=HTMLResponse)
def analytics_page(request: Request, current_user=Depends(get_current_user_from_cookie)):
    if not current_user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(request, "analytics.html", {"username": current_user["username"]})


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html")

@app.get("/signup", response_class=HTMLResponse)
def signup_page(request: Request):
    return templates.TemplateResponse(request, "signup.html")


@app.get("/delete-account", response_class=HTMLResponse)
def delete_account_page(request: Request):
    return templates.TemplateResponse(request, "delete-account.html")












    # FastAPI Startup event handler loop trigger hook
@app.on_event("startup")
def check_and_generate_recurring_expenses():
    expense_collection = db["expenses"]
    today = datetime.today()
    current_year_month = today.strftime("%Y-%m") # Expected format: "2026-06"
    
    # 1. Pure database se saare valid active recurring metrics nikalna
    recurring_templates = list(expense_collection.find({"is_recurring": True}))
    
    for template in recurring_templates:
        # Pata karo ki ye expense kis text calendar date par original link tha
        orig_date_str = template.get("expense_date", "") # "2025-05-15"
        if not orig_date_str:
            continue
            
        target_day = orig_date_str.split("-")[2] # Get date day: "15"
        expected_new_date = f"{current_year_month}-{target_day}" # New date target: "2026-06-15"
        
        # 2. Check kijiye kya is mahine is expense ka copy generate ho chuka hai ya nahi?
        already_exists = expense_collection.find_one({
            "user_id": template["user_id"],
            "amount": template["amount"],
            "category": template["category"],
            "is_recurring": True,
            "expense_date": expected_new_date
        })
        
        # 3. Agar entry exist nahi karti aur current date use cross kar chuki hai, insert clone copy!
        if not already_exists:
            # Create fresh duplicate context data mapping
            cloned_expense = {
                "user_id": template["user_id"],
                "amount": template["amount"],
                "category": template["category"],
                "payment_mode": template["payment_mode"],
                "description": template.get("description", ""),
                "expense_date": expected_new_date,
                "is_recurring": False
            }
            expense_collection.insert_one(cloned_expense)
            print(f"🚀 Auto-Generated Recurring Expense: {template['category']} - ₹{template['amount']} for Date: {expected_new_date}")





@app.get("/admin", response_class=HTMLResponse)
def admin_panel(request: Request, current_user=Depends(get_current_user_from_cookie)):
    # Guard Layer: Check if user is logged in and has an Admin role
    if not current_user or current_user.get("role") != "admin":
        return RedirectResponse(url="/login") # Block unauthorized access
        
    return templates.TemplateResponse(request, "admin.html" )








@app.get("/saving-page", response_class=HTMLResponse)
def saving_goal_page(request: Request, current_user=Depends(get_current_user_from_cookie)):
    if not current_user:
        return RedirectResponse(url="/login")
    return templates.TemplateResponse(request, "savings.html", {"username": current_user["username"]})