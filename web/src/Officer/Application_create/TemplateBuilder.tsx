import { useState, useEffect } from "react";
import { parseApiError, v } from "../../utils/validation";
import {
  TextInput,
  Select,
  SelectItem,
  Button,
  Stack,
  Checkbox,
  TextArea,
  Tag,
  InlineNotification,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Modal,
  Search,
  Tile,
  Loading,
  Pagination,
} from "@carbon/react";
import {
  TrashCan,
  UpToTop,
  DownToBottom,
  ArrowLeft,
  Add,
  Edit,
  Catalog,
  Renew,
} from "@carbon/icons-react";
import { getStoredUser } from "../../utils/currentUser";
import { getCategoryForDepartment } from "../../constants/departments";
import type { Department } from "../../Admin/Department_Management/types";

export type FieldType = 
  | 'text' | 'textarea' | 'number' | 'select' | 'multiselect' 
  | 'date' | 'file' | 'heading' | 'paragraph' | 'table' | 'payment';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string; // Comma separated for select/table
  required?: boolean;
}

interface ServiceOption {
  id: number;
  serviceId: string;
  name: string;
  category: string;
  status: string;
}

interface EligibilityRuleInfo {
  id: number;
  field: string;
  operator: string;
  value: string;
}

interface DocumentRequirementInfo {
  id: number;
  documentName: string;
  description?: string;
  isMandatory: boolean;
}

interface FeeScheduleInfo {
  id: number;
  feeType: string;
  amount: number;
  effectiveDate: string;
}

interface ServiceDetail {
  id: number;
  serviceId: string;
  name: string;
  category: string;
  eligibilityRules: EligibilityRuleInfo[];
  documentRequirements: DocumentRequirementInfo[];
  feeSchedules: FeeScheduleInfo[];
}

export interface SavedTemplate {
  id: string;
  formName: string;
  subTitle?: string;
  lawText?: string;
  department?: string;
  stageOrder: number;
  stageDescription?: string;
  serviceProcedureId?: number;
  serviceProcedure?: {
    id: number;
    serviceId: string;
    name: string;
    category?: string;
  };
  fields?: Array<{ id?: string; label: string; type: FieldType; options?: string; required?: boolean; isRequired?: boolean }>;
  status?: string;
  createdAt?: string;
}

export default function TemplateBuilder() {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [lawText, setLawText] = useState("");
  const [templateStatus, setTemplateStatus] = useState<string>("Active");
  
  // Multi-department sequential stage configuration
  const [department, setDepartment] = useState<string>("Civil Department");
  const [stageOrder, setStageOrder] = useState<number>(1);
  const [stageDescription, setStageDescription] = useState<string>("");
  
  // Dynamic Departments from Department Management
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // Cloning / Stage customization state (preserves original base template)
  const [isClonedTemplate, setIsClonedTemplate] = useState<boolean>(false);
  const [clonedSourceTitle, setClonedSourceTitle] = useState<string>("");

  // Saved Templates Catalog View State
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(true);
  const [templateSearchTerm, setTemplateSearchTerm] = useState<string>("");
  const [templateDeptFilter, setTemplateDeptFilter] = useState<string>("All");
  const [templateStageFilter, setTemplateStageFilter] = useState<string>("All");
  const [templateStatusFilter, setTemplateStatusFilter] = useState<string>("All");
  const [activeView, setActiveView] = useState<"list" | "builder">(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("id") || params.get("cloneFromId") || params.get("create") || params.get("serviceId") || params.get("stage")) {
      return "builder";
    }
    return "list";
  });
  const [deletingTemplate, setDeletingTemplate] = useState<SavedTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [listNotification, setListNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [templatePage, setTemplatePage] = useState<number>(1);
  const [templatePageSize, setTemplatePageSize] = useState<number>(10);

  const [customFields, setCustomFields] = useState<FormField[]>([]);
  
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldError, setNewFieldError] = useState<string | null>(null);
  const [headerErrors, setHeaderErrors] = useState<{ formName?: string; subTitle?: string; lawText?: string; stageDescription?: string }>({});
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [paymentFeeAmount, setPaymentFeeAmount] = useState<number>(5000);
  const [paymentMethods, setPaymentMethods] = useState<string>("Online Card, Manual Bank Deposit Slip");
  const [selectedFeeScheduleId, setSelectedFeeScheduleId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Linking this template to a Service Catalog entry so its Eligibility
  // Rules and Document/Fee configuration can be shown as reference while
  // the officer builds the form. Every officer belongs to one department, so
  // (unlike the Admin-side pages, which also allow a departmentless System
  // Admin through) any signed-in officer with a department only sees that
  // department's services here.
  const [currentUser] = useState(getStoredUser);
  const scopedCategory = currentUser?.department ? getCategoryForDepartment(currentUser.department) : null;
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [linkedServiceId, setLinkedServiceId] = useState<string>("");
  const [linkedServiceDetail, setLinkedServiceDetail] = useState<ServiceDetail | null>(null);
  const [isLoadingServiceDetail, setIsLoadingServiceDetail] = useState(false);

  // Fetch departments from backend
  useEffect(() => {
    fetch("http://localhost:5119/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDepartments(data);
          // If no department selected yet, default to first active department
          const urlDept = new URLSearchParams(window.location.search).get("department");
          if (!urlDept && !currentUser?.department && data.length > 0) {
            setDepartment(data[0].name);
          }
        }
      })
      .catch((error) => console.error("Error fetching departments:", error));
  }, []);

  useEffect(() => {
    const urlDept = new URLSearchParams(window.location.search).get("department");
    if (!urlDept && currentUser?.department) {
      setDepartment(currentUser.department);
    }
  }, [currentUser]);

  useEffect(() => {
    fetch("http://localhost:5119/api/services")
      .then((res) => res.json())
      .then((data) => {
        setServices(data.filter((srv: ServiceOption) => srv.status === "Active"));
      })
      .catch((error) => {
        console.error("Error fetching services:", error);
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!linkedServiceId) {
        setLinkedServiceDetail(null);
        return;
      }
      setIsLoadingServiceDetail(true);
      fetch(`http://localhost:5119/api/services/${linkedServiceId}`)
        .then((res) => res.json())
        .then((data) => setLinkedServiceDetail(data))
        .catch((error) => {
          console.error("Error fetching linked service details:", error);
          setLinkedServiceDetail(null);
        })
        .finally(() => setIsLoadingServiceDetail(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [linkedServiceId]);

  // Current matched department object for logo, contact and official details
  const currentDeptObj = departments.find(
    (d) =>
      d.name.toLowerCase() === (department || "").toLowerCase() ||
      d.departmentCode.toLowerCase() === (department || "").toLowerCase()
  );

  // Handle department selection with auto-filling of header and important sections
  const handleDepartmentChange = (newDeptName: string) => {
    setDepartment(newDeptName);
    const matched = departments.find(
      (d) =>
        d.name.toLowerCase() === newDeptName.toLowerCase() ||
        d.departmentCode.toLowerCase() === newDeptName.toLowerCase()
    );
    if (matched) {
      if (!subTitle || subTitle === "Document Title" || subTitle.startsWith("Official Public Service Intake") || subTitle.includes("Application Form")) {
        setSubTitle(matched.description || `Official Public Service Intake - ${matched.name}`);
      }
      if (!formName || formName === "FORM NO" || formName.includes("-FORM-")) {
        setFormName(`${matched.departmentCode}-FORM-${stageOrder}`);
      }
    }
  };

  const fetchTemplateData = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:5119/api/templates/${id}`);
      if (response.ok) {
        const data = await response.json();
        setFormName(data.formName || "");
        setSubTitle(data.subTitle || "");
        setLawText(data.lawText || "");
        if (data.status) setTemplateStatus(data.status);
        if (data.serviceProcedureId) {
          setLinkedServiceId(data.serviceProcedureId.toString());
        }
        if (data.department) setDepartment(data.department);
        if (data.stageOrder) setStageOrder(data.stageOrder);
        if (data.stageDescription) setStageDescription(data.stageDescription);
        if (data.fields) {
          setCustomFields(data.fields.map((f: { id?: string; label: string; type: FieldType; options?: string; isRequired?: boolean }) => ({
            id: f.id || Date.now().toString() + Math.random(),
            label: f.label,
            type: f.type,
            options: f.options,
            required: f.isRequired
          })));
        }
        return data;
      }
    } catch (error) {
      console.error("Error fetching template", error);
    }
    return null;
  };

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get("id");
    const cloneFromId = queryParams.get("cloneFromId");
    const isClone = queryParams.get("clone") === "true";
    const serviceId = queryParams.get("serviceId");
    const stage = queryParams.get("stage");
    const dept = queryParams.get("department");

    if (serviceId) setLinkedServiceId(serviceId);
    if (stage) setStageOrder(parseInt(stage, 10) || 1);
    if (dept) setDepartment(dept);

    // If cloning an existing base template for a workflow stage:
    // We load all fields and structure, but set templateId to NULL so saving creates a separate copy!
    if (cloneFromId || (id && isClone)) {
      const sourceId = cloneFromId || id!;
      const loadClone = async () => {
        setIsClonedTemplate(true);
        setTemplateId(null); // CRITICAL: null guarantees POST create (new independent stage template)
        const data = await fetchTemplateData(sourceId);
        if (data) {
          setTemplateId(null); // Re-assert null so update isn't triggered
          setClonedSourceTitle(data.formName || "Base Template");
          const targetStage = stage || data.stageOrder || 1;
          setFormName(data.formName ? `${data.formName} (Stage ${targetStage})` : `Stage ${targetStage} Form`);
          if (dept) setDepartment(dept);
          if (stage) setStageOrder(parseInt(stage, 10) || 1);
        }
      };
      loadClone();
    } else if (id) {
      const load = async () => {
        setTemplateId(id);
        await fetchTemplateData(id);
      };
      load();
    }
  }, []);

  // Fetch all created templates from backend
  const fetchAllTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await fetch("http://localhost:5119/api/templates/all");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSavedTemplates(data);
        }
      }
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    fetchAllTemplates();
  }, []);

  const handleCreateNewTemplate = () => {
    setTemplateId(null);
    setFormName("");
    setSubTitle("");
    setLawText("");
    setTemplateStatus("Active");
    setCustomFields([]);
    setLinkedServiceId("");
    setLinkedServiceDetail(null);
    setIsClonedTemplate(false);
    setClonedSourceTitle("");
    setStageOrder(1);
    setStageDescription("");
    if (departments.length > 0) {
      setDepartment(departments[0].name);
    }
    const url = new URL(window.location.href);
    url.search = "?create=true";
    window.history.pushState({}, "", url.toString());
    setActiveView("builder");
  };

  const handleEditTemplate = async (template: SavedTemplate) => {
    setIsClonedTemplate(false);
    setClonedSourceTitle("");
    setTemplateId(template.id);
    setFormName(template.formName || "");
    setSubTitle(template.subTitle || "");
    setLawText(template.lawText || "");
    setTemplateStatus(template.status || "Active");
    if (template.department) setDepartment(template.department);
    if (template.stageOrder) setStageOrder(template.stageOrder);
    if (template.stageDescription) setStageDescription(template.stageDescription);
    if (template.serviceProcedureId) {
      setLinkedServiceId(template.serviceProcedureId.toString());
    } else {
      setLinkedServiceId("");
      setLinkedServiceDetail(null);
    }
    if (template.fields && template.fields.length > 0) {
      setCustomFields(template.fields.map(f => ({
        id: f.id || Date.now().toString() + Math.random(),
        label: f.label,
        type: f.type,
        options: f.options,
        required: f.isRequired ?? f.required
      })));
    } else {
      await fetchTemplateData(template.id);
    }
    const url = new URL(window.location.href);
    url.search = `?id=${template.id}`;
    window.history.pushState({}, "", url.toString());
    setActiveView("builder");
  };

  const confirmDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`http://localhost:5119/api/templates/${deletingTemplate.id}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setSavedTemplates(prev => prev.filter(t => t.id !== deletingTemplate.id));
        setListNotification({
          type: "success",
          message: `Template "${deletingTemplate.formName}" was successfully deleted.`
        });
        setDeletingTemplate(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to delete template: ${err.message || res.statusText}`);
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      alert("An error occurred while deleting the template.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "Active" | "Inactive") => {
    try {
      const res = await fetch(`http://localhost:5119/api/templates/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update template status");
      }
      setSavedTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
      );
      const displayStatus = newStatus === "Active" ? "Active" : "Deactive";
      setListNotification({
        type: "success",
        message: `Template status updated to "${displayStatus}".`,
      });
    } catch (err: any) {
      console.error("Error updating template status:", err);
      setListNotification({
        type: "error",
        message: err.message || "Could not update template status.",
      });
    }
  };

  const handleBackToList = () => {
    const url = new URL(window.location.href);
    url.search = "";
    window.history.pushState({}, "", url.toString());
    setActiveView("list");
    fetchAllTemplates();
  };

  // Same rules as the backend's CreateTemplateRequest / FormFieldDto
  const DISPLAY_ONLY = ["heading", "paragraph"];

  const validateTemplate = (): string | null => {
    const errors = {
      formName: v.text("Form name", { min: 3, max: 200 })(formName) ?? undefined,
      subTitle: v.text("Main title", { max: 300, required: false })(subTitle) ?? undefined,
      lawText: v.text("Legal reference", { max: 5000, required: false })(lawText) ?? undefined,
      stageDescription: v.text("Stage description", { max: 500, required: false })(stageDescription) ?? undefined,
    };
    setHeaderErrors(errors);
    const firstHeaderError = Object.values(errors).find(Boolean);
    if (firstHeaderError) return firstHeaderError;

    if (!Number.isInteger(Number(stageOrder)) || Number(stageOrder) < 1 || Number(stageOrder) > 50) {
      return "Stage must be between 1 and 50.";
    }
    if (customFields.length > 200) return "A form can have at most 200 fields.";

    // Answers are stored by label, so two inputs with the same label would overwrite each other
    const seen = new Set<string>();
    for (const f of customFields) {
      if (DISPLAY_ONLY.includes(f.type)) continue;
      const key = f.label.trim().toLowerCase();
      if (seen.has(key)) return `Each field needs a unique label. "${f.label}" is used more than once.`;
      seen.add(key);
      if ((f.type === "select" || f.type === "multiselect") && !(f.options || "").split(",").some((o) => o.trim())) {
        return `Dropdown field "${f.label}" needs at least one option.`;
      }
    }
    return null;
  };

  const handleSaveTemplate = async () => {
    const problem = validateTemplate();
    if (problem) {
      alert(problem);
      return;
    }
    try {
      setIsSaving(true);
      const token = localStorage.getItem("officerToken");
      
      const payload = {
        formName: formName,
        subTitle: subTitle,
        lawText: lawText,
        status: templateStatus,
        serviceProcedureId: linkedServiceId ? Number(linkedServiceId) : null,
        department: department || currentUser?.department || null,
        stageOrder: Number(stageOrder) || 1,
        stageDescription: stageDescription || null,
        fields: customFields.map(f => ({
          label: f.label,
          type: f.type,
          options: f.options,
          required: f.required || false
        }))
      };

      const url = templateId 
        ? `http://localhost:5119/api/templates/update/${templateId}` 
        : "http://localhost:5119/api/templates/create";
      const method = templateId ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(parseApiError(await response.text(), "Failed to save template."));
      }

      const searchServiceId = new URLSearchParams(window.location.search).get("serviceId");
      const isWorkflowContext = Boolean(searchServiceId) && new URLSearchParams(window.location.search).get("standalone") !== "true";

      if (isWorkflowContext) {
        alert(`Stage ${stageOrder} Form Template Saved Successfully!`);
        const returnSvcId = linkedServiceId || searchServiceId || "";
        window.location.href = `/admin/services/config?serviceId=${encodeURIComponent(returnSvcId)}&tab=3`;
      } else {
        setListNotification({
          type: "success",
          message: `Template "${formName || "Application Form"}" (Stage ${stageOrder}) was successfully saved!`
        });
        await fetchAllTemplates();
        const navUrl = new URL(window.location.href);
        navUrl.search = "";
        window.history.pushState({}, "", navUrl.toString());
        setActiveView("list");
      }
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Error saving template.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddField = () => {
    const isDisplay = DISPLAY_ONLY.includes(newFieldType);
    const labelName = isDisplay ? "Text content" : newFieldType === "payment" ? "Payment section title" : "Field label";
    let error = v.text(labelName, { max: isDisplay ? 5000 : 300 })(newFieldLabel);
    if (!error && !isDisplay && customFields.some((f) => !DISPLAY_ONLY.includes(f.type) && f.label.trim().toLowerCase() === newFieldLabel.trim().toLowerCase())) {
      error = "A field with this label already exists. Labels must be unique.";
    }
    if (!error && ["select", "multiselect", "table"].includes(newFieldType)) {
      const options = newFieldOptions.split(",").map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) error = newFieldType === "table" ? "Enter at least one column name." : "Enter at least one dropdown option.";
      else if (options.some((o) => o.length > 100)) error = "Each option must be at most 100 characters.";
      else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) error = "Options must not repeat.";
    }
    if (!error && newFieldType === "payment") {
      error = v.amount("Fee amount")(String(paymentFeeAmount));
    }
    setNewFieldError(error);
    if (error) return;

    let optionsVal: string | undefined = undefined;
    if (['select', 'multiselect', 'table'].includes(newFieldType)) {
      optionsVal = newFieldOptions;
    } else if (newFieldType === 'payment') {
      optionsVal = JSON.stringify({
        feeType: newFieldLabel,
        amount: paymentFeeAmount,
        methods: paymentMethods,
      });
    }

    const newField: FormField = {
      id: Date.now().toString(),
      label: newFieldLabel,
      type: newFieldType,
      required: newFieldType === 'payment' ? true : newFieldRequired,
      options: optionsVal
    };
    setCustomFields([...customFields, newField]);
    setNewFieldLabel("");
    setNewFieldOptions("");
    setNewFieldType("text");
    setNewFieldRequired(false);
  };

  const handleRemoveField = (id: string) => {
    setCustomFields(customFields.filter(f => f.id !== id));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === customFields.length - 1) return;
    
    const newFields = [...customFields];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[swapIndex]] = [newFields[swapIndex], newFields[index]];
    setCustomFields(newFields);
  };

  const renderFieldPreview = (field: FormField) => {
    switch (field.type) {
      case 'heading':
        return <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '2px solid #000', paddingBottom: '4px' }}>{field.label}</h4>;
      
      case 'paragraph':
        return <p style={{ marginBottom: '1rem', fontStyle: 'italic', fontSize: '0.9rem' }}>{field.label}</p>;
      
      case 'table': {
        const columns = field.options ? field.options.split(',').map(s => s.trim()) : ['Col 1', 'Col 2'];
        return (
          <div style={{ marginBottom: '1.5rem', width: '100%', overflowX: 'auto' }}>
            {field.label && field.label !== 'Table' && <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{field.label}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} style={{ border: '1px solid #000', padding: '8px', backgroundColor: '#e0e0e0', textAlign: 'left' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {columns.map((_, i) => (
                    <td key={i} style={{ border: '1px solid #000', padding: '16px' }}></td>
                  ))}
                </tr>
                <tr>
                  {columns.map((_, i) => (
                    <td key={i} style={{ border: '1px solid #000', padding: '16px' }}></td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      }

      case 'file':
        return (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 'bold', width: '30%' }}>{field.label} {field.required && <span style={{color: 'red'}}>*</span>} :</div>
            <div style={{ flex: 1, border: '1px dashed #666', padding: '1rem', textAlign: 'center', backgroundColor: '#fafafa', color: '#666' }}>
              [ Required Document Upload ]
            </div>
          </div>
        );

      case 'payment': {
        let paymentConfig = { feeType: "Statutory Stage Processing Fee", amount: 5000, methods: "Online Card, Manual Bank Deposit Slip" };
        if (field.options) {
          try {
            paymentConfig = { ...paymentConfig, ...JSON.parse(field.options) };
          } catch {
            paymentConfig.feeType = field.options;
          }
        }
        return (
          <div style={{ margin: '1.5rem 0', border: '2px solid #0043ce', borderRadius: '8px', backgroundColor: '#f0f5ff', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,67,206,0.08)' }}>
            {/* Action Card Top Bar */}
            <div style={{ backgroundColor: '#0043ce', color: '#ffffff', padding: '0.625rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>💳</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Statutory Stage Payment Action
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  STAGE {stageOrder} REQUIRED
                </span>
                <span style={{ fontSize: '0.7rem', backgroundColor: '#ffffff', color: '#0043ce', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                  {department}
                </span>
              </div>
            </div>

            {/* Action Card Content */}
            <div style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1.15rem', color: '#161616' }}>
                    {field.label || paymentConfig.feeType}
                  </h4>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#525252' }}>
                    Official statutory fee for <strong>{department}</strong> processing. Payment routes to the Financial Officer for audit clearance.
                  </p>
                </div>
                <div style={{ textAlign: 'right', backgroundColor: '#ffffff', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #d0e2ff' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#525252', fontWeight: 600 }}>Payable Amount</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0043ce' }}>
                    Rs. {Number(paymentConfig.amount).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stage Payment Action Button Preview */}
              <div style={{ backgroundColor: '#ffffff', padding: '1rem', borderRadius: '6px', border: '1px solid #d0e2ff', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                      type="button"
                      disabled
                      style={{
                        backgroundColor: '#0043ce',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.625rem 1.25rem',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'default',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 2px 4px rgba(0,67,206,0.2)'
                      }}
                    >
                      <span>💳</span> Make Stage Payment
                    </button>
                    <span style={{ fontSize: '0.75rem', color: '#525252' }}>
                      Auto-redirects citizen to Payments Hub with <strong>{department}</strong> and Service pre-selected
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#0f62fe', fontWeight: 600 }}>
                    Accepted: {paymentConfig.methods}
                  </span>
                </div>
              </div>

              {/* Dual-Step Workflow Review Preview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ backgroundColor: '#edf5ff', border: '1px solid #a6c8ff', padding: '0.625rem 0.875rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0043ce', textTransform: 'uppercase' }}>
                    Step 1 • Financial Officer
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#161616', marginTop: '2px' }}>
                    Payment Verification & Ledger Audit
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#525252', marginTop: '2px' }}>
                    Clears online Stripe receipt or bank transfer slip
                  </div>
                </div>

                <div style={{ backgroundColor: '#fff8f0', border: '1px solid #fed29f', padding: '0.625rem 0.875rem', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b24c00', textTransform: 'uppercase' }}>
                    Step 2 • Verification Officer
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#161616', marginTop: '2px' }}>
                    Application Documents Review
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#b24c00', fontWeight: 600, marginTop: '2px' }}>
                    🔒 Approval locked until Step 1 payment is cleared
                  </div>
                </div>
              </div>

              {/* Policy note */}
              <div style={{ fontSize: '0.75rem', color: '#525252', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>ℹ️</span> The citizen sees real-time dual status in their mobile tracker: <strong>Payment Verifying</strong> and <strong>Application Under Review</strong>.
              </div>
            </div>
          </div>
        );
      }

      case 'textarea':
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 'bold', width: '30%', marginTop: '0.5rem' }}>{field.label} {field.required && <span style={{color: 'red'}}>*</span>} :</div>
            <div style={{ flex: 1, minHeight: '4rem', border: '1px solid #000', backgroundColor: '#fff' }} />
          </div>
        );

      case 'date':
        return (
           <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 'bold', width: '30%' }}>{field.label} {field.required && <span style={{color: 'red'}}>*</span>} :</div>
            <div style={{ flex: 1, borderBottom: '1px solid #000', paddingBottom: '4px', color: '#666' }}>DD / MM / YYYY</div>
          </div>
        );

      case 'select':
      case 'multiselect':
         return (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 'bold', width: '30%' }}>{field.label} {field.required && <span style={{color: 'red'}}>*</span>} :</div>
            <div style={{ flex: 1, border: '1px solid #000', padding: '8px', color: '#666', backgroundColor: '#fff' }}>
              [ Select from: {field.options || 'None'} ]
            </div>
          </div>
        );

      default: // text, number
        return (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
             <div style={{ fontWeight: 'bold', width: '30%' }}>{field.label} {field.required && <span style={{color: 'red'}}>*</span>} :</div>
             <div style={{ flex: 1, border: '1px solid #000', padding: '12px', backgroundColor: '#fff' }} />
          </div>
        );
    }
  };

  // Keep the currently linked service visible even if it falls outside the
  // officer's department (e.g. editing a template someone else created),
  // so the dropdown doesn't silently blank out an existing selection.
  const visibleServices = services.filter(
    (srv) => !scopedCategory || srv.category === scopedCategory || srv.id.toString() === linkedServiceId
  );

  const queryParams = new URLSearchParams(window.location.search);
  const isWorkflowLocked = Boolean(
    queryParams.get("serviceId") && 
    queryParams.get("stage") &&
    !isClonedTemplate &&
    queryParams.get("standalone") !== "true"
  );

  const filteredTemplates = savedTemplates.filter((t) => {
    const term = templateSearchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      (t.formName && t.formName.toLowerCase().includes(term)) ||
      (t.subTitle && t.subTitle.toLowerCase().includes(term)) ||
      (t.department && t.department.toLowerCase().includes(term)) ||
      (t.serviceProcedure?.name && t.serviceProcedure.name.toLowerCase().includes(term)) ||
      (t.serviceProcedure?.serviceId && t.serviceProcedure.serviceId.toLowerCase().includes(term));

    const matchesDept =
      templateDeptFilter === "All" ||
      (t.department && t.department.toLowerCase() === templateDeptFilter.toLowerCase());

    const matchesStage =
      templateStageFilter === "All" ||
      (templateStageFilter === "4+" ? t.stageOrder >= 4 : t.stageOrder.toString() === templateStageFilter);

    const matchesStatus =
      templateStatusFilter === "All" ||
      (templateStatusFilter === "Active" && (t.status === "Active" || !t.status)) ||
      (templateStatusFilter === "Inactive" && (t.status === "Inactive" || t.status === "Deactive"));

    return matchesSearch && matchesDept && matchesStage && matchesStatus;
  });

  return (
    <main className="gsn-shell-main">
      {/* Top Header & View Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button
            kind={activeView === "list" ? "primary" : "tertiary"}
            size="md"
            renderIcon={Catalog}
            onClick={() => {
              setActiveView("list");
              fetchAllTemplates();
            }}
          >
            Created Templates ({savedTemplates.length})
          </Button>
          <Button
            kind={activeView === "builder" ? "primary" : "tertiary"}
            size="md"
            renderIcon={templateId ? Edit : Add}
            onClick={() => setActiveView("builder")}
          >
            {templateId ? `Form Designer (Editing: ${formName || "Template"})` : "Form Designer"}
          </Button>
        </div>

        {activeView === "list" ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Button
              kind="ghost"
              size="md"
              renderIcon={Renew}
              onClick={fetchAllTemplates}
              hasIconOnly
              iconDescription="Refresh Templates"
            />
            <Button
              kind="primary"
              size="md"
              renderIcon={Add}
              onClick={handleCreateNewTemplate}
            >
              Create New Template
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Button
              kind="ghost"
              size="md"
              renderIcon={ArrowLeft}
              onClick={handleBackToList}
            >
              Back to Created Templates
            </Button>
            <Button
              kind="secondary"
              size="md"
              renderIcon={Add}
              onClick={handleCreateNewTemplate}
            >
              New Blank Template
            </Button>
          </div>
        )}
      </div>

      {listNotification && (
        <InlineNotification
          kind={listNotification.type}
          title={listNotification.type === "success" ? "Success" : "Notification"}
          subtitle={listNotification.message}
          onClose={() => setListNotification(null)}
          lowContrast
          style={{ marginBottom: '1.5rem' }}
        />
      )}

      {activeView === "list" ? (
        <div>
          {/* Header */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
              Advanced Template Builder
            </h1>
            <p style={{ color: '#525252', marginTop: '0.5rem' }}>
              View, edit, manage, and create official Sri Lankan government application forms and multi-department sequential workflow templates.
            </p>
          </div>

          {/* Metric Tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <Tile style={{ padding: '1.25rem', borderLeft: '4px solid #0f62fe', backgroundColor: '#fff' }}>
              <div style={{ fontSize: '0.8rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Total Templates</div>
              <div style={{ fontSize: '2.25rem', fontWeight: 600, color: '#161616', marginTop: '0.25rem' }}>{savedTemplates.length}</div>
              <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '0.25rem' }}>Active system form designs</div>
            </Tile>
            <Tile style={{ padding: '1.25rem', borderLeft: '4px solid #198038', backgroundColor: '#fff' }}>
              <div style={{ fontSize: '0.8rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Participating Departments</div>
              <div style={{ fontSize: '2.25rem', fontWeight: 600, color: '#161616', marginTop: '0.25rem' }}>
                {Array.from(new Set(savedTemplates.map(t => t.department).filter(Boolean))).length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '0.25rem' }}>With assigned templates</div>
            </Tile>
            <Tile style={{ padding: '1.25rem', borderLeft: '4px solid #8a3ffc', backgroundColor: '#fff' }}>
              <div style={{ fontSize: '0.8rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Multi-Stage Templates</div>
              <div style={{ fontSize: '2.25rem', fontWeight: 600, color: '#161616', marginTop: '0.25rem' }}>
                {savedTemplates.filter(t => t.stageOrder > 1).length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '0.25rem' }}>Stage 2+ workflow forms</div>
            </Tile>
            <Tile style={{ padding: '1.25rem', borderLeft: '4px solid #0043ce', backgroundColor: '#fff' }}>
              <div style={{ fontSize: '0.8rem', color: '#525252', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Linked to Services</div>
              <div style={{ fontSize: '2.25rem', fontWeight: 600, color: '#161616', marginTop: '0.25rem' }}>
                {savedTemplates.filter(t => Boolean(t.serviceProcedureId || t.serviceProcedure)).length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '0.25rem' }}>Service procedures connected</div>
            </Tile>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.25rem', flexWrap: 'wrap', backgroundColor: '#fff', padding: '1.25rem', border: '1px solid #e0e0e0' }}>
            <div style={{ flex: '1 1 320px' }}>
              <Search
                id="templateSearch"
                labelText="Search Templates"
                placeholder="Search by form identifier, title, department, or service..."
                value={templateSearchTerm}
                onChange={(e) => {
                  setTemplateSearchTerm(e.target.value);
                  setTemplatePage(1);
                }}
                size="md"
              />
            </div>
            <div style={{ width: '240px' }}>
              <Select
                id="deptFilter"
                labelText="Filter by Department"
                value={templateDeptFilter}
                onChange={(e) => {
                  setTemplateDeptFilter(e.target.value);
                  setTemplatePage(1);
                }}
                size="md"
              >
                <SelectItem value="All" text="All Departments" />
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.name} text={d.name} />
                ))}
              </Select>
            </div>
            <div style={{ width: '160px' }}>
              <Select
                id="stageFilter"
                labelText="Filter by Stage"
                value={templateStageFilter}
                onChange={(e) => {
                  setTemplateStageFilter(e.target.value);
                  setTemplatePage(1);
                }}
                size="md"
              >
                <SelectItem value="All" text="All Stages" />
                <SelectItem value="1" text="Stage 1" />
                <SelectItem value="2" text="Stage 2" />
                <SelectItem value="3" text="Stage 3" />
                <SelectItem value="4+" text="Stage 4+" />
              </Select>
            </div>
            <div style={{ width: '160px' }}>
              <Select
                id="statusFilter"
                labelText="Filter by Status"
                value={templateStatusFilter}
                onChange={(e) => {
                  setTemplateStatusFilter(e.target.value);
                  setTemplatePage(1);
                }}
                size="md"
              >
                <SelectItem value="All" text="All Statuses" />
                <SelectItem value="Active" text="Active" />
                <SelectItem value="Inactive" text="Deactive" />
              </Select>
            </div>
            {(templateSearchTerm || templateDeptFilter !== "All" || templateStageFilter !== "All" || templateStatusFilter !== "All") && (
              <Button
                kind="ghost"
                size="md"
                onClick={() => {
                  setTemplateSearchTerm("");
                  setTemplateDeptFilter("All");
                  setTemplateStageFilter("All");
                  setTemplateStatusFilter("All");
                  setTemplatePage(1);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Table Container */}
          <TableContainer
            title={`Created Form Templates (${filteredTemplates.length})`}
            description="Official Sri Lankan government form layouts designed with field components, payment stamps, and departmental seals."
            style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px' }}
          >
            <style>{`
              .template-catalog-table.cds--data-table {
                background-color: #f4f4f4 !important;
                border-collapse: collapse !important;
                width: 100% !important;
              }
              .template-catalog-table.cds--data-table thead {
                background-color: #e0e0e0 !important;
              }
              .template-catalog-table.cds--data-table thead tr th {
                background-color: #e0e0e0 !important;
                color: #161616 !important;
                font-weight: 700 !important;
                border-bottom: 2px solid #525252 !important;
                font-size: 0.85rem !important;
                letter-spacing: 0.3px !important;
              }
              .template-catalog-table.cds--data-table tbody tr {
                background-color: #f4f4f4 !important;
                border-bottom: 1px solid #e0e0e0 !important;
              }
              .template-catalog-table.cds--data-table tbody tr td {
                background-color: #f4f4f4 !important;
                border-bottom: 1px solid #e0e0e0 !important;
                color: #161616 !important;
                padding-top: 0.85rem !important;
                padding-bottom: 0.85rem !important;
              }
              .template-catalog-table.cds--data-table tbody tr:hover td {
                background-color: #e8e8e8 !important;
              }
            `}</style>
            {isLoadingTemplates ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loading description="Loading templates..." withOverlay={false} />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#fafafa' }}>
                <p style={{ fontSize: '1.1rem', color: '#525252', marginBottom: '1rem' }}>
                  {savedTemplates.length === 0 
                    ? "No form templates have been created yet." 
                    : "No templates match your search criteria."}
                </p>
                <Button kind="primary" renderIcon={Add} onClick={handleCreateNewTemplate}>
                  Create New Template
                </Button>
              </div>
            ) : (
              <>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <Table className="template-catalog-table">
                  <TableHead style={{ backgroundColor: '#e0e0e0' }}>
                    <TableRow style={{ backgroundColor: '#e0e0e0', borderBottom: '2px solid #525252' }}>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700 }}>Form Identifier</TableHeader>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700 }}>Department</TableHeader>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700 }}>Workflow Stage</TableHeader>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700 }}>Linked Service</TableHeader>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700 }}>Configured Fields</TableHeader>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700 }}>Status</TableHeader>
                      <TableHeader style={{ backgroundColor: '#e0e0e0', color: '#161616', fontWeight: 700, textAlign: 'right' }}>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTemplates
                      .slice((templatePage - 1) * templatePageSize, templatePage * templatePageSize)
                      .map((template) => (
                      <TableRow key={template.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                        <TableCell>
                          <span style={{ fontWeight: 600, color: '#161616', fontSize: '0.95rem' }} title={template.subTitle || undefined}>
                            {template.formName || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Tag type="blue" size="md">
                            {template.department || "General"}
                          </Tag>
                        </TableCell>
                        <TableCell>
                          <Tag type={template.stageOrder === 1 ? "cool-gray" : "teal"} size="md">
                            Stage {template.stageOrder}
                          </Tag>
                          {template.stageDescription && (
                            <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '2px', maxWidth: '180px' }}>
                              {template.stageDescription}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {template.serviceProcedure?.name ? (
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '0.85rem', color: '#161616' }}>
                                {template.serviceProcedure.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#0f62fe' }}>
                                {template.serviceProcedure.serviceId}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#8d8d8d', fontSize: '0.85rem', fontStyle: 'italic' }}>
                              Standalone Base Template
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tag type="gray" size="sm">
                            {template.fields?.length || 0} fields
                          </Tag>
                        </TableCell>
                        <TableCell>
                          <select
                            id={`status-select-${template.id}`}
                            aria-label="Status"
                            value={template.status === "Active" || !template.status ? "Active" : "Inactive"}
                            onChange={(e) => handleUpdateStatus(template.id, e.target.value as "Active" | "Inactive")}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                              MozAppearance: 'none',
                              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='${(template.status === "Active" || !template.status) ? '%230e6027' : '%23c62828'}' d='M8 11L3 6h10l-5 5z'/%3e%3c/svg%3e")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 10px center',
                              backgroundSize: '10px 10px',
                              backgroundColor: (template.status === "Active" || !template.status) ? '#defbe6' : '#ffebee',
                              color: (template.status === "Active" || !template.status) ? '#0e6027' : '#c62828',
                              border: `1px solid ${(template.status === "Active" || !template.status) ? '#a7f0ba' : '#ffcdd2'}`,
                              borderRadius: '16px',
                              height: '32px',
                              paddingLeft: '14px',
                              paddingRight: '30px',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              outline: 'none',
                              width: '120px',
                              minWidth: '120px',
                              whiteSpace: 'nowrap',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <option value="Active" style={{ backgroundColor: '#ffffff', color: '#0e6027', fontWeight: 600 }}>Active</option>
                            <option value="Inactive" style={{ backgroundColor: '#ffffff', color: '#c62828', fontWeight: 600 }}>Deactive</option>
                          </select>
                        </TableCell>
                        <TableCell style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={Edit}
                              onClick={() => handleEditTemplate(template)}
                            >
                              Edit
                            </Button>
                            <Button
                              kind="danger--ghost"
                              size="sm"
                              renderIcon={TrashCan}
                              hasIconOnly
                              iconDescription="Delete Template"
                              onClick={() => setDeletingTemplate(template)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
                <Pagination
                  backwardText="Previous page"
                  forwardText="Next page"
                  itemsPerPageText="Rows per page:"
                  page={templatePage}
                  pageSize={templatePageSize}
                  pageSizes={[10, 20, 50]}
                  totalItems={filteredTemplates.length}
                  onChange={({ page, pageSize }) => {
                    if (page) setTemplatePage(page);
                    if (pageSize) setTemplatePageSize(pageSize);
                  }}
                />
              </>
            )}
          </TableContainer>

          {/* Delete Confirmation Modal */}
          <Modal
            danger
            open={Boolean(deletingTemplate)}
            modalHeading="Delete Form Template"
            primaryButtonText={isDeleting ? "Deleting..." : "Delete Template"}
            secondaryButtonText="Cancel"
            onRequestClose={() => setDeletingTemplate(null)}
            onRequestSubmit={confirmDeleteTemplate}
          >
            <p style={{ marginBottom: '1rem', color: '#161616' }}>
              Are you sure you want to permanently delete the template <strong>"{deletingTemplate?.formName}"</strong>?
            </p>
            {deletingTemplate?.department && (
              <p style={{ marginBottom: '0.5rem', color: '#525252', fontSize: '0.875rem' }}>
                Department: <strong>{deletingTemplate.department}</strong> (Stage {deletingTemplate.stageOrder})
              </p>
            )}
            <p style={{ color: '#da1e28', fontSize: '0.85rem' }}>
              This action cannot be undone. Any services currently linked to this template may need re-configuration.
            </p>
          </Modal>
        </div>
      ) : (
        /* Form Designer Builder View */
        <div>
          {isWorkflowLocked && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={ArrowLeft}
                onClick={() => {
                  const searchServiceId = new URLSearchParams(window.location.search).get("serviceId");
                  const returnSvcId = linkedServiceId || searchServiceId || "";
                  window.location.href = `/admin/services/config?serviceId=${encodeURIComponent(returnSvcId)}&tab=3`;
                }}
                style={{ color: '#0f62fe' }}
              >
                Back to Service Workflow Configuration
              </Button>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Tag type="blue" size="md">ADMIN SERVICE DESIGNER</Tag>
                <Tag type="teal" size="md">STAGE {stageOrder}</Tag>
              </div>
            </div>
          )}

          {isClonedTemplate && (
            <InlineNotification
              kind="info"
              title="Customizing Stage-Specific Template Copy"
              subtitle={`You are configuring a customized copy for Stage ${stageOrder} based on "${clonedSourceTitle}". Any fields you add, modify, or remove will be saved as a separate template for this service stage. The original base template in Template Builder will NOT be modified.`}
              lowContrast
              hideCloseButton
              style={{ marginBottom: '1.5rem' }}
            />
          )}

          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>
                {templateId 
                  ? `Edit Template: ${formName || "Application Form"}`
                  : isClonedTemplate 
                    ? `Customize Template for Stage ${stageOrder}` 
                    : "Create New Application Template"}
              </h1>
              <p style={{ color: '#525252', marginTop: '0.5rem' }}>
                {templateId
                  ? `Editing existing template (${templateId}). Changes will update this template upon saving.`
                  : isClonedTemplate 
                    ? `Tailoring form fields for ${department}. Saving creates a new stage template copy.`
                    : "Design highly customizable application forms matching official Sri Lankan government layouts."}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Button
                kind="ghost"
                size="md"
                renderIcon={ArrowLeft}
                onClick={handleBackToList}
              >
                Back to Created Templates
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* Builder Controls (Left Side) */}
        <div className="w-full lg:flex-1 lg:min-w-[350px] lg:max-w-[450px] lg:sticky lg:top-20" style={{ backgroundColor: '#fff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', borderBottom: '1px solid #e0e0e0', paddingBottom: '0.5rem' }}>Document Headers & Department</h3>
          <Stack gap={5}>
            <TextInput
              id="formName"
              labelText="Form Number/Identifier"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={200}
              invalid={!!headerErrors.formName}
              invalidText={headerErrors.formName}
            />
            <TextInput
              id="subTitle"
              labelText="Main Title"
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              maxLength={300}
              invalid={!!headerErrors.subTitle}
              invalidText={headerErrors.subTitle}
            />
            <TextInput
              id="lawText"
              labelText="Legal Reference (Optional)"
              value={lawText}
              onChange={(e) => setLawText(e.target.value)}
            />

            {/* Department Selection */}
            {isWorkflowLocked ? (
              <div style={{
                padding: '1.25rem',
                backgroundColor: '#edf5ff',
                border: '1px solid #a6c8ff',
                borderLeft: '5px solid #0f62fe',
                borderRadius: '4px',
                marginTop: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#0f62fe', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Workflow Stage Assignment
                  </span>
                  <Tag type="blue" size="sm">Stage {stageOrder}</Tag>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', fontWeight: 600 }}>Assigned Department</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#161616', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {currentDeptObj?.logoUrl && (
                      <img src={currentDeptObj.logoUrl} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'contain' }} />
                    )}
                    {department}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#525252', textTransform: 'uppercase', fontWeight: 600 }}>Linked Service Procedure</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#161616', marginTop: '2px' }}>
                    {linkedServiceDetail ? `${linkedServiceDetail.serviceId} - ${linkedServiceDetail.name}` : (services.find(s => s.id.toString() === linkedServiceId)?.name || (linkedServiceId ? `Service #${linkedServiceId}` : 'None'))}
                  </div>
                </div>

                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: '#525252', fontStyle: 'italic', borderTop: '1px dashed #c6c6c6', paddingTop: '0.5rem' }}>
                  Applications at this stage route directly to {department} verification officers.
                </p>
              </div>
            ) : (
              <>
                <Select
                  id="department"
                  labelText="Assigned Department"
                  helperText="Selecting a department auto-fills the official logo, header titles, and contact information."
                  value={department}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                >
                  {departments.length > 0 ? (
                    departments.map((d) => (
                      <SelectItem key={d.id} value={d.name} text={`${d.name} (${d.departmentCode})`} />
                    ))
                  ) : (
                    <>
                      <SelectItem value="Civil Department" text="Civil Department" />
                      <SelectItem value="Police Department" text="Police Department" />
                      <SelectItem value="Transport Department" text="Transport Department" />
                      <SelectItem value="Department of Registration of Persons" text="Department of Registration of Persons" />
                      <SelectItem value="Department of Immigration & Emigration" text="Department of Immigration & Emigration" />
                      <SelectItem value="Department of Motor Traffic" text="Department of Motor Traffic" />
                      <SelectItem value="Divisional Secretariat" text="Divisional Secretariat" />
                    </>
                  )}
                </Select>

                <TextInput
                  id="stageOrder"
                  type="number"
                  min={1}
                  labelText="Sequential Workflow Stage Number"
                  helperText="Enter the sequential stage number this form belongs to (e.g. 1, 2, 3, 4, 5...)."
                  value={stageOrder.toString()}
                  onChange={(e) => setStageOrder(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />

                <Select
                  id="linkedService"
                  labelText="Linked Service Catalog Entry"
                  helperText="Ties this template to a service so its eligibility rules and required documents/fees show below."
                  value={linkedServiceId}
                  onChange={(e) => setLinkedServiceId(e.target.value)}
                >
                  <SelectItem value="" text="-- None (Standalone Department Template) --" />
                  {visibleServices.map((srv) => (
                    <SelectItem key={srv.id} value={srv.id.toString()} text={`${srv.serviceId} - ${srv.name}`} />
                  ))}
                </Select>
              </>
            )}

            <TextInput
              id="stageDescription"
              labelText="Stage Instructions for Citizens"
              placeholder="e.g. Identity and address verification by Civil Department"
              value={stageDescription}
              onChange={(e) => setStageDescription(e.target.value)}
            />

            {linkedServiceId && (
              <div style={{ padding: '1rem', backgroundColor: '#f4f4f4', borderLeft: '4px solid #24a148' }}>
                <h4 style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Service Requirements</h4>
                {isLoadingServiceDetail ? (
                  <p style={{ color: '#525252', fontSize: '0.875rem' }}>Loading...</p>
                ) : !linkedServiceDetail ? (
                  <InlineNotification
                    kind="error"
                    lowContrast
                    hideCloseButton
                    title="Could not load service details"
                    subtitle="The service may have been removed from the catalog."
                  />
                ) : (
                  <Stack gap={5}>
                    <div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#525252', marginBottom: '0.5rem' }}>
                        Eligibility Rules
                      </p>
                      {linkedServiceDetail.eligibilityRules.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: '#8d8d8d', fontStyle: 'italic' }}>None defined.</p>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.875rem' }}>
                          {linkedServiceDetail.eligibilityRules.map((rule) => (
                            <li key={rule.id}>{rule.field} {rule.operator} {rule.value}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#525252', marginBottom: '0.5rem' }}>
                        Required Documents
                      </p>
                      {linkedServiceDetail.documentRequirements.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: '#8d8d8d', fontStyle: 'italic' }}>None defined.</p>
                      ) : (
                        <Stack gap={2}>
                          {linkedServiceDetail.documentRequirements.map((doc) => (
                            <div key={doc.id} className="flex items-center flex-wrap" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                              <span>{doc.documentName}</span>
                              <Tag type={doc.isMandatory ? 'red' : 'gray'} size="sm">
                                {doc.isMandatory ? 'Mandatory' : 'Optional'}
                              </Tag>
                            </div>
                          ))}
                        </Stack>
                      )}
                    </div>

                    <div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', color: '#525252', marginBottom: '0.5rem' }}>
                        Fees
                      </p>
                      {linkedServiceDetail.feeSchedules.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: '#8d8d8d', fontStyle: 'italic' }}>None defined.</p>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.875rem' }}>
                          {linkedServiceDetail.feeSchedules.map((fee) => (
                            <li key={fee.id}>{fee.feeType} - LKR {fee.amount.toLocaleString()}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Stack>
                )}
              </div>
            )}

            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f4f4f4', borderLeft: '4px solid #0f62fe' }}>
              <h4 style={{ marginBottom: '1rem', fontWeight: 'bold' }}>Add New Element</h4>
              <Stack gap={5}>
                <Select
                  id="fieldType"
                  labelText="Element Type"
                  value={newFieldType}
                  onChange={(e) => {
                    const val = e.target.value as FieldType;
                    setNewFieldType(val);
                    if (val === 'payment') {
                      if (!newFieldLabel) setNewFieldLabel("Statutory Processing Fee");
                      setNewFieldRequired(true);
                    }
                  }}
                >
                  <optgroup label="Layout & Text">
                    <SelectItem value="heading" text="Section Heading" />
                    <SelectItem value="paragraph" text="Paragraph / Instructions" />
                  </optgroup>
                  <optgroup label="Inputs">
                    <SelectItem value="text" text="Short Text Input" />
                    <SelectItem value="textarea" text="Long Text Area" />
                    <SelectItem value="number" text="Number Input" />
                    <SelectItem value="date" text="Date Picker" />
                  </optgroup>
                  <optgroup label="Selections">
                    <SelectItem value="select" text="Dropdown (Single Select)" />
                    <SelectItem value="multiselect" text="Dropdown (Multi-Select)" />
                  </optgroup>
                  <optgroup label="Complex & Official">
                    <SelectItem value="table" text="Data Table Grid" />
                    <SelectItem value="file" text="Required Document Upload" />
                    <SelectItem value="payment" text="💳 Statutory Payment Section" />
                  </optgroup>
                </Select>

                <TextArea
                  id="fieldLabel"
                  labelText={['heading', 'paragraph'].includes(newFieldType) ? "Text Content" : newFieldType === 'payment' ? "Payment Section Title" : "Field Label"}
                  rows={2}
                  value={newFieldLabel}
                  onChange={(e) => {
                    setNewFieldLabel(e.target.value);
                    if (newFieldError) setNewFieldError(null);
                  }}
                  invalid={!!newFieldError}
                  invalidText={newFieldError ?? undefined}
                />
                
                {newFieldType === 'payment' && (
                  <div style={{ backgroundColor: '#edf5ff', border: '1px solid #a6c8ff', padding: '0.75rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0043ce', marginBottom: '0.5rem' }}>
                      Statutory Payment Settings
                    </div>

                    {linkedServiceDetail?.feeSchedules && linkedServiceDetail.feeSchedules.length > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <Select
                          id="select-fee-schedule"
                          labelText="Link to Service Fee Schedule"
                          size="sm"
                          value={selectedFeeScheduleId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedFeeScheduleId(val);
                            const found = linkedServiceDetail.feeSchedules.find((f) => f.id.toString() === val);
                            if (found) {
                              setNewFieldLabel(found.feeType);
                              setPaymentFeeAmount(found.amount);
                            }
                          }}
                        >
                          <SelectItem value="" text="-- Select predefined fee --" />
                          {linkedServiceDetail.feeSchedules.map((fee) => (
                            <SelectItem
                              key={fee.id}
                              value={fee.id.toString()}
                              text={`${fee.feeType} — Rs. ${fee.amount.toLocaleString()}`}
                            />
                          ))}
                        </Select>
                      </div>
                    )}

                    <div style={{ marginBottom: '0.5rem' }}>
                      <TextInput
                        id="payment-fee-amount"
                        labelText="Statutory Payable Amount (LKR)"
                        type="number"
                        size="sm"
                        value={paymentFeeAmount}
                        onChange={(e) => setPaymentFeeAmount(Number(e.target.value))}
                      />
                    </div>

                    <div>
                      <TextInput
                        id="payment-methods"
                        labelText="Accepted Payment Methods"
                        size="sm"
                        value={paymentMethods}
                        onChange={(e) => setPaymentMethods(e.target.value)}
                        placeholder="e.g. Online Card, Manual Bank Deposit Slip"
                      />
                    </div>
                  </div>
                )}

                {(['select', 'multiselect', 'table'].includes(newFieldType)) && (
                  <TextArea
                    id="fieldOptions"
                    labelText={newFieldType === 'table' ? "Table Columns (Comma separated)" : "Dropdown Options (Comma separated)"}
                    placeholder="e.g. Option 1, Option 2, Option 3"
                    rows={2}
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                  />
                )}
                
                {!['heading', 'paragraph', 'payment'].includes(newFieldType) && (
                  <Checkbox 
                    labelText="Required Field" 
                    id="required-checkbox" 
                    checked={newFieldRequired}
                    onChange={(_, {checked}) => setNewFieldRequired(checked)} 
                  />
                )}

                <Button onClick={handleAddField} size="md" disabled={!newFieldLabel.trim()} style={{ marginTop: '0.5rem' }}>
                  Add Element
                </Button>
              </Stack>
            </div>
          </Stack>
        </div>

        {/* Live Form Preview (Right Side) */}
        <div className="w-full lg:flex-[2] lg:min-w-[500px]" style={{ backgroundColor: '#fff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e0e0e0', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#161616' }}>Live Document Preview</h3>
            <Button size="sm" kind="primary" onClick={handleSaveTemplate} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Template"}
            </Button>
          </div>
          
          <div className="p-4 sm:p-8 lg:p-12" style={{ backgroundColor: '#fff', border: '1px solid #ccc', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>

            {/* Stage & Department Banner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', backgroundColor: '#edf5ff', border: '1px solid #a6c8ff', borderRadius: '4px', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Tag type="blue">Stage {stageOrder}</Tag>
                <span style={{ fontWeight: 600, color: '#0043ce', fontSize: '0.875rem' }}>
                  {department}
                </span>
              </div>
              {stageDescription && (
                <span style={{ fontSize: '0.8rem', color: '#525252', fontStyle: 'italic' }}>
                  {stageDescription}
                </span>
              )}
            </div>

            {/* Form Header matching Official Sri Lankan Government Style */}
            <div style={{ textAlign: 'center', marginBottom: '2.5rem', fontFamily: 'Arial, sans-serif' }}>
              <div className="flex-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '2px solid #161616', paddingBottom: '1.25rem' }}>
                 {/* Left: Department Logo */}
                 <div style={{ width: '85px', height: '85px', flexShrink: 0, border: '2px solid #0f62fe', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden', backgroundColor: '#f4f4f4', padding: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
                   {currentDeptObj?.logoUrl ? (
                     <img
                       src={currentDeptObj.logoUrl}
                       alt={currentDeptObj.name}
                       style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                       onError={(e) => {
                         (e.target as HTMLElement).style.display = 'none';
                       }}
                     />
                   ) : (
                     <div style={{ textAlign: 'center', color: '#0f62fe' }}>
                       <span style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'block' }}>{currentDeptObj?.departmentCode || 'GSN'}</span>
                       <span style={{ fontSize: '0.6rem', color: '#525252' }}>LOGO</span>
                     </div>
                   )}
                 </div>

                 {/* Center: Official Government & Department Header */}
                 <div style={{ flex: '1 1 300px', padding: '0 1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#525252' }}>
                      Democratic Socialist Republic of Sri Lanka
                    </div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 'bold', margin: '0.25rem 0', color: '#0043ce', textTransform: 'uppercase' }}>
                      {currentDeptObj?.name || department}
                    </h2>
                    {(currentDeptObj?.departmentCode || currentDeptObj?.contactNumber || currentDeptObj?.email) && (
                      <div style={{ fontSize: '0.75rem', color: '#525252', marginBottom: '0.35rem' }}>
                        {[
                          currentDeptObj.departmentCode && `ID: ${currentDeptObj.departmentCode}`,
                          currentDeptObj.contactNumber && `Tel: ${currentDeptObj.contactNumber}`,
                          currentDeptObj.email && `Email: ${currentDeptObj.email}`,
                        ].filter(Boolean).join(" • ")}
                      </div>
                    )}
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '0.35rem 0 0.2rem 0', textTransform: 'uppercase', color: '#161616' }}>
                      {formName || "APPLICATION FORM"}
                    </h3>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.2rem 0', color: '#393939' }}>
                      {subTitle || (currentDeptObj ? `${currentDeptObj.name} - Stage ${stageOrder} Application` : "Official Public Service Intake")}
                    </h4>
                    {lawText && <p style={{ fontSize: '0.8rem', fontStyle: 'italic', margin: '0.2rem 0 0 0', color: '#525252' }}>{lawText}</p>}
                 </div>

                 {/* Right: Official Department Seal / Stage Stamp */}
                 <div style={{ width: '95px', height: '85px', flexShrink: 0, border: '2px dashed #0043ce', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f5ff', borderRadius: '4px', padding: '6px' }}>
                   <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#0043ce', fontWeight: 'bold' }}>OFFICIAL STAMP</span>
                   <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#161616', marginTop: '2px' }}>{currentDeptObj?.departmentCode || `DEP-${stageOrder}`}</span>
                   <span style={{ fontSize: '0.65rem', color: '#24a148', fontWeight: 600, marginTop: '2px' }}>✓ STAGE {stageOrder}</span>
                 </div>
              </div>
            </div>
            
            {customFields.length === 0 ? (
              <p style={{ color: '#8d8d8d', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                No elements added yet. Build the form using the controls on the left.
              </p>
            ) : (
              <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '1rem', lineHeight: '1.5', color: '#000' }}>
                {customFields.map((field, index) => (
                  <div key={field.id} style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', width: '100%', padding: '0.5rem 0', borderBottom: '1px solid transparent', transition: 'border-color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.borderBottom = '1px dashed #ccc'}
                    onMouseLeave={(e) => e.currentTarget.style.borderBottom = '1px solid transparent'}
                  >
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderFieldPreview(field)}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '1rem', flexShrink: 0, opacity: 0.7 }}>
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={UpToTop} iconDescription="Move Up" onClick={() => moveField(index, 'up')} disabled={index === 0} style={{ minHeight: '32px', width: '32px', padding: 0 }} />
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={DownToBottom} iconDescription="Move Down" onClick={() => moveField(index, 'down')} disabled={index === customFields.length - 1} style={{ minHeight: '32px', width: '32px', padding: 0 }} />
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Remove" onClick={() => handleRemoveField(field.id)} style={{ color: '#da1e28', minHeight: '32px', width: '32px', padding: 0 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )}
</main>
);
}

