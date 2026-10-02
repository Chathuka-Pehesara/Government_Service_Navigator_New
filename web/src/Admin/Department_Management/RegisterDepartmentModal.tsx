import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  InlineNotification,
  Stack,
  Button,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { hasErrors, parseApiError } from "../../utils/validation";
import { logoFileError, validateDepartment, type DepartmentField } from "./departmentValidation";
import { API_BASE_URL } from "../../utils/api";
import { CATEGORIES } from "./categories";
import type { Department } from "./types";

interface RegisterDepartmentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (createdDept: Department) => void;
}

export default function RegisterDepartmentModal({
  open,
  onClose,
  onSuccess,
}: RegisterDepartmentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DepartmentField, string>>>({});

  const [departmentCode, setDepartmentCode] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [category, setCategory] = useState<string>("General");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [contactNumber, setContactNumber] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [status, setStatus] = useState<string>("Inactive");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the form each time the modal opens (adjusted during render, not in an effect)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setCategory("General");
      setLogoUrl("");
      setContactNumber("");
      setEmail("");
      setWebsite("");
      setAddress("");
      setDescription("");
      setStatus("Inactive");
      setFormError(null);
    }
  }

  const fetchNextCode = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/departments/next-code`);
      if (res.ok) {
        const data = await res.json();
        setDepartmentCode(data.nextCode);
      }
    } catch (err) {
      console.error("Error fetching next department code:", err);
    }
  };

  // Fetch next auto-generated code when modal opens
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      await fetchNextCode();
    };
    load();
  }, [open]);

  // Handle logo file upload
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileError = logoFileError(file);
      if (fileError) {
        setFormError(fileError);
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        setLogoUrl(result);
        setFormError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit handler
  const handleSubmit = async () => {
    const errors = validateDepartment({ name, logoUrl, contactNumber, email, website, address, description });
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setFormError("Please correct the highlighted fields.");
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload = {
        departmentCode: departmentCode || undefined,
        name: name.trim(),
        category,
        logoUrl: logoUrl.trim() || undefined,
        contactNumber: contactNumber.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        address: address.trim() || undefined,
        description: description.trim() || undefined,
        status,
      };

      const res = await fetch(`${API_BASE_URL}/api/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        try {
          setFieldErrors(JSON.parse(text)?.fields ?? {});
        } catch {
          // not JSON
        }
        throw new Error(parseApiError(text, "Failed to register department."));
      }
      const data = JSON.parse(text);

      onSuccess(data);
    } catch (err) {
      setFormError((err instanceof Error && err.message) || "Failed to register department.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      modalHeading="Register New State Department"
      modalLabel="Department Management"
      primaryButtonText={isSubmitting ? "Registering..." : "Register Department"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isSubmitting}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      size="md"
    >
      {formError && (
        <InlineNotification
          kind="error"
          title="Registration Error"
          subtitle={formError}
          lowContrast
          style={{ marginBottom: "1rem" }}
        />
      )}

      <Stack gap={5}>
        {/* Auto-Generated Department Code Section */}
        <div
          style={{
            backgroundColor: "#edf5ff",
            border: "1px solid #a6c8ff",
            borderRadius: "4px",
            padding: "0.875rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "#0043ce",
                letterSpacing: "0.5px",
              }}
            >
              System Auto-Generated Department ID
            </div>
            <div
              style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "#0f62fe",
                marginTop: "2px",
              }}
            >
              {departmentCode || "Generating..."}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#525252" }}>
              Sequential system identifier assigned to this public authority.
            </div>
          </div>
          <Button
            kind="ghost"
            size="sm"
            type="button"
            tabIndex={-1}
            renderIcon={Renew}
            iconDescription="Regenerate"
            onClick={fetchNextCode}
          >
            Sync Next
          </Button>
        </div>

        {/* Department Name */}
        <TextInput
          id="reg-dept-name"
          labelText="Department Name *"
          placeholder="e.g. Department of Wildlife Conservation"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (formError) setFormError(null);
          }}
          disabled={isSubmitting}
          autoFocus
          maxLength={150}
          invalid={!!fieldErrors.name}
          invalidText={fieldErrors.name}
        />

        {/* Category / Sector */}
        <Select
          id="reg-dept-category"
          labelText="Sector / Category *"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={isSubmitting}
        >
          {CATEGORIES.map((cat) => (
            <SelectItem key={cat} value={cat} text={cat} />
          ))}
        </Select>

        {/* Logo Management */}
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "#161616",
              marginBottom: "0.5rem",
            }}
          >
            Department Official Logo
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "6px",
                border: "1px dashed #8d8d8d",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f4f4f4",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo Preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: "0.7rem", color: "#8d8d8d", textAlign: "center" }}>
                  No Logo
                </span>
              )}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  onChange={handleLogoFileChange}
                />
                <Button
                  kind="tertiary"
                  size="sm"
                  type="button"
                  tabIndex={-1}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                >
                  Upload Logo File
                </Button>
                {logoUrl && (
                  <Button
                    kind="ghost"
                    size="sm"
                    type="button"
                    tabIndex={-1}
                    onClick={() => setLogoUrl("")}
                    disabled={isSubmitting}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <TextInput
                id="reg-dept-logo-url"
                labelText=""
                hideLabel
                placeholder="Or enter logo web image URL (https://...)"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={isSubmitting}
                invalid={!!fieldErrors.logoUrl}
                invalidText={fieldErrors.logoUrl}
              />
            </div>
          </div>
        </div>

        {/* Mobile / Telephone Contact */}
        <TextInput
          id="reg-dept-contact"
          labelText="Department Contact / Mobile Number *"
          placeholder="e.g. +94 11 288 8888 or +94 77 123 4567"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          helperText="Direct public inquiry telephone or official mobile hotline."
          disabled={isSubmitting}
          maxLength={20}
          invalid={!!fieldErrors.contactNumber}
          invalidText={fieldErrors.contactNumber}
        />

        {/* Email Address */}
        <TextInput
          id="reg-dept-email"
          labelText="Official Email Address"
          placeholder="e.g. info@department.gov.lk"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          maxLength={254}
          invalid={!!fieldErrors.email}
          invalidText={fieldErrors.email}
        />

        {/* Official Website */}
        <TextInput
          id="reg-dept-website"
          labelText="Official Portal / Website URL"
          placeholder="e.g. https://www.department.gov.lk"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={isSubmitting}
          maxLength={2048}
          invalid={!!fieldErrors.website}
          invalidText={fieldErrors.website}
        />

        {/* Head Office Address */}
        <TextInput
          id="reg-dept-address"
          labelText="Head Office Physical Address"
          placeholder="e.g. Suhurupaya, Subhuthipura Road, Battaramulla"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isSubmitting}
          maxLength={300}
          invalid={!!fieldErrors.address}
          invalidText={fieldErrors.address}
        />

        {/* Mandate & Scope Description */}
        <TextArea
          id="reg-dept-desc"
          labelText="Scope & Mandate (Description)"
          placeholder="Brief summary of statutory functions, public duties, and service offerings..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
          maxLength={2000}
          invalid={!!fieldErrors.description}
          invalidText={fieldErrors.description}
        />

        {/* Status */}
        <Select
          id="reg-dept-status"
          labelText="Initial Operational Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={isSubmitting}
          helperText="New departments default to Inactive (Deactivated). To activate, you must first register the department and assign at least 1 Verifying Officer and 1 Finance Officer."
        >
          <SelectItem value="Inactive" text="Inactive (Deactivated - Recommended until officers assigned)" />
          <SelectItem value="Active" text="Active (Requires assigned Verifying & Finance Officers)" disabled />
        </Select>
      </Stack>
    </Modal>
  );
}
