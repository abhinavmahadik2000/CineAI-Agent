import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import movieSlice from './slices/movieSlice';
import userSlice from './slices/userSlice';
import chatSlice from './slices/chatSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    movies: movieSlice,
    user: userSlice,
    chat: chatSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;