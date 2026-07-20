from fastapi import APIRouter, HTTPException, status, Response, BackgroundTasks
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from backend.database import db # Database instance
from backend.schema import UserSignupSchema, UserLoginSchema, DeleteAccountRequest
import os
from dotenv import load_dotenv
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr

# .env file se variables ko load karein
load_dotenv()

router = APIRouter()
user_collection = db["users"]

collection = db["savings_goals"]
goal_collection = db["savings_goals"]
expense_collection = db["expenses"]
transfer_collection = db["savings_transfer_log"]
transaction_collection = db["savings_transactions"]


SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is missing! Production deployment halted.")

print(f"Algorithm loaded successfully: {ALGORITHM}")

# 1. SIGNUP ENDPOINT
@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(user_data: UserSignupSchema, background_tasks: BackgroundTasks):
    # Check if user already exists
    existing_user = user_collection.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Password hashing using bcrypt
    hashed_password = bcrypt.hashpw(user_data.password.encode('utf-8'), bcrypt.gensalt())
    
    user_dict = user_data.model_dump()
    user_dict["password"] = hashed_password.decode('utf-8') # save hashed text
    user_dict["role"] = "user"


    user_collection.insert_one(user_dict)

    try:
        email_message = send_welcome_email_background(user_data.email, user_data.username)
        
       
        background_tasks.add_task(fastmail.send_message, email_message)
        
    except Exception as e:
        
        print(f"Failed to queue welcome email: {e}")
    return {"message": "User registered successfully"}

# 2. LOGIN ENDPOINT (Generates secure HttpOnly Cookie Token)
@router.post("/login")
def login(user_data: UserLoginSchema, response: Response):
    user = user_collection.find_one({"email": user_data.email})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    # Verify password hash
    if not bcrypt.checkpw(user_data.password.encode('utf-8'), user["password"].encode('utf-8')):
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    # Create JWT Token valid for 1 Day
   
    # expire = datetime.now(timezone.utc) + timedelta(days=15)
    expire_days = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", 7))
    expire  = datetime.now(timezone.utc) + timedelta(days=expire_days)
    token_payload = {"sub": str(user["_id"]), "username": user["username"], "role": str(user.get("role","user")),   "exp": expire}
    encoded_jwt = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)
    
    # Set safe HttpOnly Cookie (JavaScript cannot steal this cookie, making it secure)
    response.set_cookie(
        key="access_token", 
        value=encoded_jwt, 
        httponly=True, 
        max_age=604800, 
        samesite="lax"
    )
    user_role = str(user.get("role", "user"))
    return {"message": "Login successful", "username": user["username"], "role":user_role }

# 3. LOGOUT ENDPOINT
@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out successfully"}







from fastapi import Request,Depends

# Global function jo check karegi user logged in hai ya nahi
def get_current_user_from_cookie(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        # Token ko decode karke user details nikalna
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload # Returns dictionary with keys: sub (id), username, exp
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None







from bson import ObjectId

import bcrypt

from fastapi import APIRouter, HTTPException, Depends



@router.put("/update-profile")
def update_profile(user_payload: dict, current_user=Depends(get_current_user_from_cookie)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    
    user_id = ObjectId(current_user["sub"])
    
    # Catching all fields from frontend
    new_username = user_payload.get("username", "").strip()
    new_email = user_payload.get("email", "").strip()
    new_password = user_payload.get("password")

    # Conditional stripping
    new_password = new_password.strip() if new_password else ""
    new_budget = float(user_payload.get("budget", 0))
    
    if len(new_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long.")
    
    if not new_email or "@" not in new_email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    # Email duplication check
    existing_user = user_collection.find_one({"email": new_email})
    if existing_user and str(existing_user["_id"]) != str(user_id):
        raise HTTPException(status_code=400, detail="This email is already taken.")

    # Base dictionary for storage
    update_data = {
        "username": new_username,
        "email": new_email,
        "budget": new_budget
    }

    # Hash password if user typed a new one
    if new_password:
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        hashed_pw = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
        update_data["password"] = hashed_pw.decode('utf-8')

    # Atomic MongoDB update
    user_collection.update_one({"_id": user_id}, {"$set": update_data})
    return {"message": "Success", "new_username": new_username}









# 1. Connection Config Setup (.env se read karega)
mail_config = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_FROM_NAME=os.getenv("MAIL_FROM_NAME", "Expense Tracker Team"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

fastmail = FastMail(mail_config)

# 2. Email bhejne ka helper function (HTML Template ke saath)
def send_welcome_email_background(email_to: str, username: str):
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #4CAF50;">Welcome to Expense Tracker, {username}! 🎉</h2>
                <p>Hello {username},</p>
                <p>Your account has been successfully created. We are thrilled to have you onboard!</p>
                <p>Now you can securely log in, set your monthly budgets, manage your piggy banks, and track your cash flows easily.</p>
                <hr style="border: 0; border-top: 1px solid #eee;" />
                <p style="font-size: 12px; color: #777;">This is an automated onboarding message from your Expense Tracker Dashboard app.</p>
            </div>
        </body>
    </html>
    """
    
    message = MessageSchema(
        subject="Account Successfully Registered! 🚀",
        recipients=[email_to],
        body=html_content,
        subtype=MessageType.html
    )
    
    # FastMail ko background task engine ko pass karenge taaki request block na ho
    return message




# 2. Cookie-based User verification dependency
async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Session expired! login again please.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # JWT ke 'sub' mein jo stored user handle (email/username) hai usse user fetch karna
        user_identifier = payload.get("sub")
        
        # Pehle check karein ki 'sub' email hai ya username, uske hisab se database query karein
        user = await user_collection.find_one({"email": user_identifier}) or await user_collection.find_one({"username": user_identifier})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found!")
        return user
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid session! please login!")




@router.post("/api/account/delete")
async def delete_user_account(request_data: DeleteAccountRequest, request: Request):
    payload = get_current_user_from_cookie(request)
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired! Please Login")
    
    user_identifier = payload.get("sub")
    print(f"--- TOKEN DECODED VALUE (sub): {user_identifier} ---")

    
    query_filter = {
        "$or": [
            {"email": user_identifier},
            {"username": user_identifier}
        ]
    }
    
    try:
        if ObjectId.is_valid(user_identifier):
            query_filter["$or"].append({"_id": ObjectId(user_identifier)})
    except:
        pass

   
    current_user = user_collection.find_one(query_filter)
    
    if not current_user:
        raise HTTPException(
            status_code=404, 
            detail=f"User Not Found!"
        )

    # Password Check (Bcrypt)
    db_pass = current_user["password"].encode('utf-8') if isinstance(current_user["password"], str) else current_user["password"]
    if not bcrypt.checkpw(request_data.password.encode('utf-8'), db_pass):
        raise HTTPException(status_code=400, detail="Incorrect password!")

    # Data Deletion
    try:
        user_email = current_user.get("email")
        user_username = current_user.get("username")
        
      
        if user_email:
            expense_collection.delete_many({"user_email": user_email})
            goal_collection.delete_many({"user_email": user_email})
            transfer_collection.delete_many({"user_email": user_email})
            transaction_collection.delete_many({"user_email": user_email})
            
        if user_username:
            expense_collection.delete_many({"username": user_username})
            goal_collection.delete_many({"username": user_username})

        user_collection.delete_one({"_id": current_user["_id"]})

        return {"status": "success", "message": "Account deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))