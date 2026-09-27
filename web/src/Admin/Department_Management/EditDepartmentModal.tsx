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
  Tag,
} from "@carbon/react";
import { CATEGORIES } from "./RegisterDepartmentModal";
import type { Department } from "./types";

interface EditDepartmentModalProps {
  open: boolean;
  department: Department | null;
  onClose: () => void;
  onSuccess: (updatedDept: any) => void;
}

export default function EditDepartmentModal({
  open,
  department,
  onClose,
  onSuccess,
}: EditDepartmentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState<string>("");
  const [category, setCategory] = useState<string>("General");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [contactNumber, setContactNumber] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [address, setAddress] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [status, setStatus] = useState<string>("Active");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (department && open) {
      setName(department.name || "");
      setCategory(department.category || "General");
      setLogoUrl(department.logoUrl || "");
      setContactNumber(department.contactNumber || "");
      setEmail(department.email || "");
      setWebsite(department.website || "");
      setAddress(department.address || "");
      setDescription(department.description || "");
      setStatus(department.status || "Active");
      setFormError(null);
    }
  }, [department, open]);

  // Handle logo file upload
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setFormError("Logo file size exceeds 2MB limit. Please choose a smaller image.");
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
    if (!department) return;
    if (!name.trim()) {
      setFormError("Department Name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      const payload = {
        departmentCode: department.departmentCode,
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

      const res = await fetch(`http://localhost:5119/api/departments/${department.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update department.");
      }

      onSuccess(data);
    } catch (err: any) {
      setFormError(err.message || "Failed to update department.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!department) return null;

  return (
    <Modal
      open={open}
      modalHeading={`Edit Department: ${department.name}`}
      modalLabel="Department Management"
      primaryButtonText={isSubmitting ? "Saving..." : "Save Changes"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isSubmitting}
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      size="md"
    >
      {formError && (
        <InlineNotification
          kind="error"
          title="Update Error"
          subtitle={formError}
          lowContrast
          style={{ marginBottom: "1rem" }}
        />
      )}

      <Stack gap={5}>
        <div
          style={{
            backgroundColor: "#f4f4f4",
            padding: "0.75rem 1rem",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <span style={{ fontSize: "0.75rem", color: "#525252" }}>Department Code: </span>
            <Tag type="blue" style={{ fontWeight: 600 }}>
              {department.departmentCode}
            </Tag>
          </div>
          <Tag type={status === "Active" ? "green" : "red"}>{status}</Tag>
        </div>

        <TextInput
          id="edit-dept-name"
          labelText="Department Name *"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (formError) setFormError(null);
          }}
          disabled={isSubmitting}
        />

        <Select
          id="edit-dept-category"
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
                  Change Logo File
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
                id="edit-dept-logo-url"
                labelText=""
                hideLabel
                placeholder="Or enter logo web image URL"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        <TextInput
          id="edit-dept-contact"
          labelText="Department Contact / Mobile Number"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          disabled={isSubmitting}
        />

        <TextInput
          id="edit-dept-email"
          labelText="Official Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
        />

        <TextInput
          id="edit-dept-website"
          labelText="Official Portal / Website URL"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          disabled={isSubmitting}
        />

        <TextInput
          id="edit-dept-address"
          labelText="Head Office Physical Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isSubmitting}
        />

        <TextArea
          id="edit-dept-desc"
          labelText="Scope & Mandate (Description)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSubmitting}
        />

        <Select
          id="edit-dept-status"
          labelText="Operational Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={isSubmitting}
        >
          <SelectItem value="Active" text="Active" />
          <SelectItem value="Inactive" text="Inactive" />
        </Select>
      </Stack>
    </Modal>
  );
}
