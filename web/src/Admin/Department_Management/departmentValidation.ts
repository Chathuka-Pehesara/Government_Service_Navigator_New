import { all, v, validateForm } from "../../utils/validation";

export type DepartmentField = "name" | "logoUrl" | "contactNumber" | "email" | "website" | "address" | "description";

export interface DepartmentFormValues {
  name: string;
  logoUrl: string;
  contactNumber: string;
  email: string;
  website: string;
  address: string;
  description: string;
}

const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Problem with a chosen logo file, or null when it can be used. */
export function logoFileError(file: File): string | null {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) return "Logo must be a PNG, JPEG, GIF or WebP image.";
  if (file.size > MAX_LOGO_BYTES) return "Logo file size exceeds 2MB limit. Please choose a smaller image.";
  return null;
}

// Logo: an uploaded image (data: URL) or a web address
const logo = (value: string) =>
  !value.trim() || value.trim().startsWith("data:image/") ? null : v.url("Logo URL")(value);

/** Same rules as the backend's DepartmentCreateDto / DepartmentUpdateDto. */
export function validateDepartment(values: DepartmentFormValues) {
  return validateForm<DepartmentField>({
    name: [values.name, v.text("Department name", { min: 3, max: 150 })],
    logoUrl: [values.logoUrl, logo],
    contactNumber: [values.contactNumber, all(v.required("Contact number"), v.phone(true, true))],
    email: [values.email, v.email(false)],
    website: [values.website, v.url("Website")],
    address: [values.address, v.text("Address", { max: 300, required: false })],
    description: [values.description, v.text("Description", { max: 2000, required: false })],
  });
}
