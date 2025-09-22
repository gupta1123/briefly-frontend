# Enhanced Agent Testing

This directory contains the test interface for the new enhanced agentic chatbot functionality.

## Features

- New `/chat/ask-v2` endpoint with improved agent orchestration
- Modular backend architecture without refactoring existing code
- Frontend test interface accessible through the sidebar
- API proxy for secure backend communication

## How to Test

1. Start both the frontend and backend servers
2. Log in to the application
3. Navigate to "Test Agent" in the sidebar
4. Ask questions to test the enhanced agent functionality

## Backend Structure

- New routes are implemented in `/server/src/routes/agents.js`
- Registered through `/server/src/routes/index.js`
- Maintains backward compatibility with existing endpoints

## Frontend Structure

- Test page located at `/frontend/src/app/test-agent/page.tsx`
- API proxy at `/frontend/src/app/api/test-agent/route.ts`
- Accessible through the sidebar navigation