import { useState } from "react";
import { Modal, InlineNotification } from "@carbon/react";
import { API_BASE_URL } from "../../utils/api";

interface SuspendAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  officer: { id: string; name?: string; status?: string } | null;
}

export default function SuspendAccountModal({ isOpen, onClose, onSuccess, officer }: SuspendAccountModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isCurrentlySuspended = officer?.status === "Suspended";

  const handleSubmit = async () => {
    setFormError(null);
    setIsSubmitting(true);

    if (!officer?.id) {
      setFormError("Error: Missing Officer ID. Please refresh the page and try again.");
      setIsSubmitting(false);
      return;
    }
    try {
      const endpoint = isCurrentlySuspended 
        ? `${API_BASE_URL}/api/admin/officers/${officer.id}/activate`
        : `${API_BASE_URL}/api/admin/officers/${officer.id}/suspend`;

      const response = await fetch(endpoint, {
        method: "PATCH", 
        headers: { "Content-Type": "application/json" }
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        let errorMessage = "Failed to change account status.";
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          errorMessage = `Server Error: ${response.status} ${response.statusText}.`;
        }
        setFormError(errorMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Failed to fetch") {
         setFormError("Cannot reach the server. Please try again shortly.");
      } else {
         setFormError(`Request failed: ${message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      danger={!isCurrentlySuspended}
      open={isOpen}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      modalHeading={isCurrentlySuspended ? "Reactivate Account" : "Suspend Account"}
      primaryButtonText={isSubmitting ? "Processing..." : (isCurrentlySuspended ? "Reactivate Officer" : "Suspend Officer")}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isSubmitting}
    >
      <p style={{ marginBottom: '1.5rem', color: '#525252' }}>
        {isCurrentlySuspended 
          ? `Are you sure you want to restore access for ${officer?.name}? They will be able to log in and verify documents immediately.`
          : `Are you sure you want to suspend ${officer?.name}? They will immediately lose access to the Registry Portal.`
        }
      </p>

      {formError && (
        <InlineNotification kind="error" title="Error" subtitle={formError} lowContrast style={{ marginBottom: '1rem' }} />
      )}
    </Modal>
  );
}