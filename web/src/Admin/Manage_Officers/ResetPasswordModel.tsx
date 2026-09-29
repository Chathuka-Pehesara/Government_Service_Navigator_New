import { useState } from "react";
import {
  Modal,
  PasswordInput,
  Stack,
  InlineNotification
} from "@carbon/react";
import { parseApiError, v } from "../../utils/validation";
import { API_BASE_URL } from "../../utils/api";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  officer: { id: string; name?: string } | null;
}

export default function ResetPasswordModal({ isOpen, onClose, officer }: ResetPasswordModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!officer) return;
    setFormError(null);
    setSuccessMsg(null);
    // Same rule as the backend's ResetPasswordRequest
    const error = v.strongPassword()(newPassword);
    setPasswordError(error);
    if (error) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/officers/${officer.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });

      if (response.ok) {
        setSuccessMsg("Password successfully reset.");
        setTimeout(() => {
          onClose();
          setNewPassword("");
          setSuccessMsg(null);
        }, 1500);
      } else {
        setFormError(parseApiError(await response.text(), `Failed to reset password (${response.status}).`));
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
      open={isOpen}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      modalHeading="Reset Officer Password"
      primaryButtonText={isSubmitting ? "Resetting..." : "Reset Password"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isSubmitting || !newPassword || !!successMsg}
    >
      <p style={{ marginBottom: '1.5rem', color: '#525252' }}>
        You are overriding the password for <strong>{officer?.name}</strong>. They will be logged out of all active sessions.
      </p>

      {formError && (
        <InlineNotification kind="error" title="Error" subtitle={formError} lowContrast style={{ marginBottom: '1rem' }} />
      )}
      {successMsg && (
        <InlineNotification kind="success" title="Success" subtitle={successMsg} lowContrast style={{ marginBottom: '1rem' }} />
      )}

      <Stack gap={5}>
        <PasswordInput
          id="new-password"
          labelText="New Temporary Password"
          placeholder="Create a strong password"
          helperText="At least 8 characters with an uppercase letter, a lowercase letter and a number."
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isSubmitting || !!successMsg}
          maxLength={64}
          invalid={!!passwordError}
          invalidText={passwordError ?? undefined}
        />
      </Stack>
    </Modal>
  );
}