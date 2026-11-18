# MySobo

Verified local-first business directory for South Bopal.

## Stack

- React.js + TypeScript
- Django REST Framework
- Standalone PostgreSQL

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and configure PostgreSQL.
2. Create the database and run:
   `cd backend && python -m pip install -r requirements.txt && python manage.py migrate`
3. Start the API:
   `python manage.py runserver`
4. Install and start the frontend:
   `cd frontend && npm install && npm run dev`

Never commit `.env` or database credentials.
