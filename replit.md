# KidCoins - Habit Tracker for Kids

## Overview
A mobile habit tracker app for parents to manage their kids' habits with a coin-based reward system. Kids earn coins by completing daily habits and can redeem them for rewards.

## Recent Changes
- 2026-02-24: Initial build with habits, wallet, rewards, and activity log

## Architecture
- **Frontend**: Expo React Native with Expo Router (file-based routing)
- **Backend**: Express server on port 5000 (landing page + API)
- **Storage**: AsyncStorage for local data persistence
- **Styling**: Nunito font family, teal + amber color theme

### Key Files
- `lib/storage.ts` - All AsyncStorage CRUD operations (habits, completions, rewards, redemptions, balance)
- `lib/habitIcons.ts` - Icon and color configuration for habits/rewards
- `app/(tabs)/index.tsx` - Habits dashboard (main screen)
- `app/(tabs)/wallet.tsx` - Wallet with balance and transaction history
- `app/(tabs)/rewards.tsx` - Rewards store (2-column grid)
- `app/(tabs)/activity.tsx` - Activity log (sectioned by date)
- `app/add-habit.tsx` - Modal to create new habit
- `app/add-reward.tsx` - Modal to create new reward

### Navigation
- 4 tabs: Habits, Wallet, Rewards, Activity
- 2 modals: Add Habit, Add Reward
- NativeTabs with liquid glass on iOS 26+, classic Tabs with BlurView fallback

## User Preferences
- None specified yet
