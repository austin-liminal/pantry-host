/**
 * Accessible modal dialog built on @radix-ui/react-dialog.
 *
 * Provides: focus trapping, Escape key dismiss, body scroll lock,
 * portal rendering, click-outside-to-close, and full ARIA support.
 */
import * as Dialog from '@radix-ui/react-dialog';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible title — announced by screen readers. */
  title: string;
  children: React.ReactNode;
  /** Full-screen takeover (e.g. Batch Scan) vs centered panel (default). */
  fullScreen?: boolean;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  fullScreen = false,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        {!fullScreen && (
          <Dialog.Overlay className="fixed inset-0 z-50 bg-body-translucent backdrop-blur-sm" />
        )}
        <Dialog.Content
          className={
            fullScreen
              ? 'fixed inset-0 z-50 bg-body flex flex-col'
              : 'fixed inset-0 z-50 flex items-center justify-center pointer-events-none'
          }
          aria-label={title}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {fullScreen ? (
            children
          ) : (
            <div className="bg-body w-full max-w-sm max-h-[85vh] flex flex-col rounded-lg pointer-events-auto shadow-2xl">
              {children}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Dialog };
