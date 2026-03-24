import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmDialog.module.css';

function ConfirmDialog({
    open,
    title,
    description,
    confirmText = '확인',
    cancelText = '취소',
    onConfirm,
    onCancel,
}) {
    useEffect(function () {
        if (!open) {
            return;
        }

        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                onCancel();
            }
        }

        document.addEventListener('keydown', handleKeyDown);

        return function () {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onCancel]);

    if (!open || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div className={styles.overlay} onClick={onCancel}>
            <div
                className={styles.dialog}
                onClick={function (event) {
                    event.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
            >
                <div className={styles.header}>
                    <h3 id="confirm-dialog-title" className={styles.title}>{title}</h3>
                </div>
                <p className={styles.description}>{description}</p>
                <div className={styles.actions}>
                    <button className={styles.cancelButton} onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button className={styles.confirmButton} onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default ConfirmDialog;
