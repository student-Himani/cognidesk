import React from 'react';
import { useAppSelector } from '../../hooks/useRedux';
import AILoadingScreen from '../loading/AILoadingScreen';

export const LoadingOverlay: React.FC = () => {
  const { globalLoading, loadingMessage } = useAppSelector((state) => state.ui);

  if (!globalLoading) return null;

  return (
    <AILoadingScreen
      show={globalLoading}
      message={loadingMessage || 'Processing Workspace...'}
      submessage="Executing local cryptographic & neural operations"
    />
  );
};

export default LoadingOverlay;

