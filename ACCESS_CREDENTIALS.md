# Demo Roles and Credentials (Local Only)

Use these accounts to test role-based access in the app. Do not use in production.

- System Administrator
  - Username: `admin`
  - Password: `Admin#2025`

- Content Manager
  - Username: `manager`
  - Password: `Manager#2025`

- Content Viewer
  - Username: `viewer`
  - Password: `Viewer#2025`

- Guest (Time-Limited)
  - Username: `guest`
  - Password: `Guest#2025`
  - Access expires automatically after 3 days

Notes
- Guest and Viewer are read-only; Manager can upload/edit/move/link/delete; Admin has full control and global settings.
- Credentials are hard-coded in `src/hooks/use-auth.tsx` for demo purposes.
