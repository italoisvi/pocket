# Pocket

Personal finance mobile app built with React Native and Expo.

## Stack

- **Frontend:** React Native + Expo (Expo Go compatible)
- **Backend:** Supabase (Auth + PostgreSQL)
- **Language:** TypeScript
- **Navigation:** Expo Router
- **Testing:** Vitest

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure Supabase:
   - Copy `.env.example` to `.env`
   - Fill in your Supabase URL and anon key

3. Set up Supabase database:
   - Create a `profiles` table with the following schema:

     ```sql
     create table profiles (
       id uuid references auth.users on delete cascade primary key,
       created_at timestamp with time zone default timezone('utc'::text, now()) not null,
       name text
     );

     -- Enable RLS
     alter table profiles enable row level security;

     -- Create policies
     create policy "Users can view their own profile"
       on profiles for select
       using (auth.uid() = id);

     create policy "Users can update their own profile"
       on profiles for update
       using (auth.uid() = id);
     ```

## Development

Start the development server:

```bash
npm start
```

Run on specific platform:

```bash
npm run android  # Android
npm run ios      # iOS
npm run web      # Web
```

## Testing

```bash
npm test              # Run tests
npm test -- --watch   # Watch mode
```

## Code Quality

```bash
npm run format        # Format code
npm run format:check  # Check formatting
npm run typecheck     # Type checking
npm run lint          # Linting
```

## Project Structure

```
pocket/
├── app/              # Expo Router screens
│   ├── (auth)/      # Authentication screens
│   ├── (tabs)/      # Main app screens
│   └── _layout.tsx  # Root layout with auth protection
├── lib/             # Utilities and configuration
│   └── supabase.ts  # Supabase client
├── types/           # TypeScript types
├── components/      # Reusable components
└── assets/          # Images and icons
```

## Features

- User authentication (login/signup) with Supabase
- Protected routes
- Clean, minimalist UI
- Camera FAB button on home screen (placeholder)
