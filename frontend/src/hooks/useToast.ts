import { useAppDispatch } from './useRedux';
import { addToast, ToastType } from '../store/slices/toastSlice';

export const useToast = () => {
  const dispatch = useAppDispatch();

  const showToast = (type: ToastType, title: string, message?: string, duration?: number) => {
    dispatch(addToast({ type, title, message, duration }));
  };

  return {
    showSuccess: (title: string, message?: string) => showToast('success', title, message),
    showError: (title: string, message?: string) => showToast('error', title, message),
    showInfo: (title: string, message?: string) => showToast('info', title, message),
    showWarning: (title: string, message?: string) => showToast('warning', title, message),
  };
};
