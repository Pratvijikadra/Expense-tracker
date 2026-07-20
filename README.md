# 💸 Smart Expense Tracker App

A modern Expense Tracker App built with FastAPI, MongoDB Atlas, Jinja2 Templates, Bootstrap 5, javaScripts and JWT Authentication.
The system provides a highly intuitive and secure interface for users to efficiently track daily expenses, month-wise financial data, utilize a personal dynamic Piggy Bank for saving goals,
and generate real-time financial logs in PDF.

## 🎬 Project Demo Video

User Workflow Demo : https://drive.google.com/file/d/1KD7HI6TGFVZR-yiw9LtprmHb0MnRgWdV/view?usp=sharing

### 👤 Features
* User Registration & Secure Login Panel
* Secure JWT Authentication & Cookie-Based Sessions
* Add Daily Expenses with metadata (Amount, Description, Date)
* Category-Wise Expense Classification (Food, Rent, Travel, etc.)
* **Smart Piggy Bank (Savings Goals)**
  * Create Targeted Saving Goals
  * Deposit Money into Goals (with atomic increments)
  * Withdraw Money from Goals (with insufficient balance guard)
  * Automated Server-Side Timestamp Mapping (`created_at`)
  * Auto transfer money if you set budget and at the end of month money remain in budgets **SMART FEATUTE**
* Dynamic Analytics Dashboard
* Bootstrap Toast Notifications for Transaction Success/Failure
* Account Settings (Update Profile / Change Password/ delete account)

---

## 🛠 Tech Stack

### Backend
* FastAPI
* Python
* PyMongo
* MongoDB Atlas

### Frontend
* HTML5
* CSS3
* Bootstrap 5
* JavaScript
* Jinja2 Templates

### Database
* MongoDB Atlas

## ⚙ Installation

### Clone Repository

git clone https://github.com/Pratvijikadra/Expense-tracker.git
cd expense_tracker

Create Virtual Environment
Bash
python -m venv venv
Activate Environment

Windows:
Bash
venv\Scripts\activate

Install Dependencies
Bash
pip install -r requirements.txt
Create .env File
Create a .env file in the root directory and configure your credentials:
```
MONGO_URI=YOUR_MONGODB_CONNECTION_STRING
SECRET_KEY=YOUR_SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_DAYS=7
MAIL_USERNAME= username
MAIL_PASSWORD= app password
MAIL_FROM= from username
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com
MAIL_FROM_NAME=Expense Tracker Team
```

Run Application
Bash
uvicorn main:app --reload
Open http://127.0.0.1:8000 in your browser.

🔐 Authentication
JWT Access Token Generation
(Bcrypt) Password Hashing
Secure HTTP Cookie-Based Session Management

👨‍💻 Author
Pratvi Jikadra
Python Developer

GitHub : https://github.com/Pratvijikadra

LinkedIn: www.linkedin.com/in/pratvi-jikadra-551923361
