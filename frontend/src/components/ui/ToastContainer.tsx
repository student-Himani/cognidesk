import React, { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../../hooks/useRedux';
import { removeToast, ToastMessage } from '../../store/slices/toastSlice';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastItem: React.FC<{ toast: ToastMessage }> = ({ toast }) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(removeToast(toast.id));
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [dispatch, toast]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-500/30 bg-slate-900/95 dark:bg-slate-900/95 text-slate-100',
    error: 'border-rose-500/30 bg-slate-900/95 dark:bg-slate-900/95 text-slate-100',
    info: 'border-blue-500/30 bg-slate-900/95 dark:bg-slate-900/95 text-slate-100',
    warning: 'border-amber-500/30 bg-slate-900/95 dark:bg-slate-900/95 text-slate-100',
  };

  return (
    <div
      className={`flex items-start space-x-3 p-4 rounded-xl border ${borders[toast.type]} shadow-2xl backdrop-blur-xl animate-pop-in max-w-md w-full pointer-events-auto`}
    >
      {icons[toast.type]}
      <div className="flex-1 space-y-0.5">
        <h4 className="font-semibold text-sm leading-tight text-slate-100">{toast.title}</h4>
        {toast.message && <p className="text-xs text-slate-400 leading-relaxed">{toast.message}</p>}
      </div>
      <button
        onClick={() => dispatch(removeToast(toast.id))}
        className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const toasts = useAppSelector((state) => state.toast.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};

export default ToastContainer;
