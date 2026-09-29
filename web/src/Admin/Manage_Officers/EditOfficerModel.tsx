import { useState } from "react";
import {
  Modal,
  TextInput,
  Select,
  SelectItem,
  Stack,
  InlineNotification
} from "@carbon/react";
import { DEPARTMENTS } from "../../constants/departments";
import { hasErrors, parseApiError, v, validateForm } from "../../utils/validation";

interface Officer {
  id: string;
  name?: string;
  email?: string;
  department?: string;
  role?: string;
  status?: string;
}

interface EditOfficerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  officer: Officer | null; // Pass the selected officer row data here
}

function getStoredOfficerUser(): { department?: string; role?: string } {
  const storedUser = localStorage.getItem("officerUser");
  if (storedUser) {
    try {
      return JSON.parse(storedUser);
    } catch {
      // ignore parse error
    }
  }
  return {};
}

export default function EditOfficerModal({ isOpen, onClose, onSuccess, officer }: EditOfficerModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"fullName" | "department" | "role", string>>>({});

  const [currentUser] = useState(getStoredOfficerUser);
  const isDepartmentAdmin = (currentUser.role || "").toLowerCase().includes("admin") && !!currentUser.department;

  const [formData, setFormData] = useState({
    fullName: "",
    department: "",
    role: ""
  });

  // Populate form when the modal opens with a specific officer
  const [prevOfficer, setPrevOfficer] = useState(officer);
  if (officer !== prevOfficer) {
    setPrevOfficer(officer);
    if (officer) {
      setFormData({
        fullName: officer.name || "",
        department: officer.department || "",
        role: officer.role || "Verifying Officer"
      });
    }
  }

  const handleSubmit = async () => {
    if (!officer) return;
    setFormError(null);
    // Same rules as the backend's UpdateOfficerRequest
    const errors = validateForm({
      fullName: [formData.fullName, v.personName("Full name")],
      department: [formData.department, v.required("Department")],
      role: [formData.role, v.required("Role")],
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;
    setIsSubmitting(true);

    try {
      // NOTE: You will need to create this PUT endpoint in your backend AdminController
      const response = await fetch(`http://localhost:5119/api/admin/officers/${officer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess(); // Refresh table
        onClose(); // Close modal
      } else {
        const body = await response.text();
        try {
          setFieldErrors(JSON.parse(body)?.fields ?? {});
        } catch {
          // not JSON
        }
        setFormError(parseApiError(body, "Failed to update officer profile."));
      }
    } catch {
      setFormError("Network error. Could not connect to the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      modalHeading="Edit Officer Profile"
      primaryButtonText={isSubmitting ? "Saving..." : "Save Changes"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isSubmitting}
    >
      <p style={{ marginBottom: '1.5rem', color: '#525252' }}>
        Update the details for <strong>{officer?.email}</strong>.
      </p>

      {formError && (
        <InlineNotification kind="error" title="Error" subtitle={formError} lowContrast style={{ marginBottom: '1rem' }} />
      )}

      <Stack gap={5}>
        <TextInput
          id="edit-fullName"
          labelText="Full Name"
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          disabled={isSubmitting}
          maxLength={100}
          invalid={!!fieldErrors.fullName}
          invalidText={fieldErrors.fullName}
        />
        <Select
          id="edit-department"
          labelText="Department"
          value={formData.department}
          onChange={(e) => {
            const nextDepartment = e.target.value;
            setFormData((prev) => ({
              ...prev,
              department: nextDepartment,
            }));
          }}
          disabled={isSubmitting || isDepartmentAdmin}
          invalid={!!fieldErrors.department}
          invalidText={fieldErrors.department}
        >
          <SelectItem value="" text="Choose a department" />
          {DEPARTMENTS.map((dept) => (
            <SelectItem key={dept.slug} value={dept.label} text={dept.label} />
          ))}
        </Select>
        <Select
          id="edit-role"
          labelText="Role Designation"
          helperText={isDepartmentAdmin ? "Assign Verifying Officer, Finance Officer, or Auditor." : undefined}
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          disabled={isSubmitting}
        >
          <SelectItem value="Verifying Officer" text="Verifying Officer" />
          <SelectItem value="Finance Officer" text="Finance Officer" />
          <SelectItem value="Auditor" text="Auditor" />
          {!isDepartmentAdmin && (
            <SelectItem value="Department Admin" text="Department Admin" />
          )}
        </Select>
      </Stack>
    </Modal>
  );
}