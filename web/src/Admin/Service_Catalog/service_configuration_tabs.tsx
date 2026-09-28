import "@carbon/styles/css/styles.css";
import { useState, useEffect, useMemo } from "react";
import CurrentUserBadge from "../../components/CurrentUserBadge";
import { getStoredUser, getAdminOverviewHref, isDeptAdmin, canManageServices } from "../../utils/currentUser";
import { getCategoryForDepartment } from "../../constants/departments";
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderMenuButton,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Search,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Tag,
  Button,
  Loading,
  Modal,
  TextInput,
  Select,
  SelectItem,
  Checkbox,
  InlineNotification,
  Tile,
  TextArea,
} from "@carbon/react";
import {
  Dashboard,
  UserMultiple,
  Security,
  Settings,
  Logout,
  Notification,
  Catalog,
  Rule,
  Categories,
  TrashCan,
  Edit,
  Add,
  Upload,
  Renew,
  Document,
  View,
  CheckmarkFilled,
} from "@carbon/icons-react";
import type { Department } from "../Department_Management/types";

const docHeaders = [
  { key: "documentName", header: "Document Type" },
  { key: "description", header: "Description" },
  { key: "isMandatory", header: "Requirement" },
  { key: "actions", header: "Actions" },
];

const feeHeaders = [
  { key: "feeType", header: "Fee Type" },
  { key: "amount", header: "Amount (LKR)" },
  { key: "effectiveDate", header: "Effective Date" },
  { key: "actions", header: "Actions" },
];

interface ServiceOption {
  id: number;
  serviceId: string;
  name: string;
  category?: string;
  status?: string;
}

interface DocumentRequirement {
  id: string;
  documentName: string;
  description: string;
  isMandatory: boolean;
}

interface FeeSchedule {
  id: string;
  feeType: string;
  amount: number;
  effectiveDate: string;
}

const AVAILABLE_DEPARTMENTS = [
  "Department of Immigration & Emigration",
  "Department of Registration of Persons",
  "Department of Motor Traffic",
  "Police Department",
  "Divisional Secretariat",
  "Transport Department",
  "Civil Department",
];

export default function ServiceConfigurationTabs() {
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const [currentUser] = useState(getStoredUser);
  const [overviewHref] = useState(() => getAdminOverviewHref(currentUser));
  const deptAdminUser = isDeptAdmin(currentUser);        // Department Admin
  const isSysAdmin = canManageServices(currentUser);
  const scopedCategory = deptAdminUser && currentUser?.department ? getCategoryForDepartment(currentUser.department) : null;

  if (!isSysAdmin) {
    return (
      <HeaderContainer
        render={({ isSideNavExpanded, onClickSideNavExpand }) => (
          <>
            <Header aria-label="GSN Service Configuration">
              <HeaderMenuButton
                aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
                onClick={onClickSideNavExpand}
                isActive={isSideNavExpanded}
                aria-expanded={isSideNavExpanded}
              />
              <HeaderName href={overviewHref} prefix="GSN">
                Registry Admin
              </HeaderName>
              <HeaderGlobalBar>
                <CurrentUserBadge />
              </HeaderGlobalBar>
            </Header>
            <main
              className="mt-12 min-h-screen p-8 flex flex-col items-center justify-center"
              style={{ backgroundColor: "#f4f4f4", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}
            >
              <div style={{ maxWidth: "620px", width: "100%" }}>
                <InlineNotification
                  kind="error"
                  title="Access Denied: System Administrator Only"
                  subtitle="Service workflows, form templates, required documents, fee schedules, and policy knowledge bases are managed centrally by System Administrators. Department Administrators and officers do not have permission to modify these configurations."
                  lowContrast
                  hideCloseButton
                />
                <div style={{ marginTop: "1.5rem" }}>
                  <Button onClick={() => window.location.href = overviewHref}>
                    Return to Department Dashboard
                  </Button>
                </div>
              </div>
            </main>
          </>
        )}
      />
    );
  }
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");

  const [documents, setDocuments] = useState<DocumentRequirement[]>([]);
  const [fees, setFees] = useState<FeeSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");
  const [selectedTabIndex, setSelectedTabIndex] = useState<number>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "3" || tab === "workflow" || tab === "stages") return 3;
    if (tab === "2" || tab === "knowledge") return 2;
    if (tab === "1" || tab === "fees") return 1;
    return 0;
  });
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info" | "warning";
    title: string;
    subtitle: string;
  } | null>(null);

  // Multi-Department Sequential Workflow State
  const [totalStages, setTotalStages] = useState<number>(1);
  const [workflowType, setWorkflowType] = useState<"single" | "multiple">("single");
  const [workflowDepartments, setWorkflowDepartments] = useState<string[]>(["Civil Department"]);
  const [stageTemplates, setStageTemplates] = useState<Array<{
    id: string;
    formName: string;
    subTitle?: string;
    department?: string;
    stageOrder: number;
    stageDescription?: string;
    status: string;
  }>>([]);
  const [allAvailableTemplates, setAllAvailableTemplates] = useState<Array<{
    id: string;
    formName: string;
    subTitle?: string;
    department?: string;
    stageOrder: number;
    stageDescription?: string;
    serviceProcedureId?: number;
    fields?: Array<any>;
    status?: string;
  }>>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedAdoptTemplatePerStage, setSelectedAdoptTemplatePerStage] = useState<Record<number, string>>({});
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [, setIsLoadingWorkflow] = useState(false);

  const fetchAllTemplates = async () => {
    try {
      const res = await fetch("http://localhost:5119/api/templates/all");
      if (res.ok) {
        const data = await res.json();
        setAllAvailableTemplates(data || []);
      }
    } catch (e) {
      console.error("Error fetching all templates:", e);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch("http://localhost:5119/api/departments");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDepartments(data);
        }
      }
    } catch (e) {
      console.error("Error fetching departments:", e);
    }
  };

  // Modal State for Adding/Editing Documents
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isDocEditMode, setIsDocEditMode] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [docForm, setDocForm] = useState({
    documentName: "",
    description: "",
    isMandatory: true,
  });

  // Modal State for Adding/Editing Fees
  const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
  const [isFeeEditMode, setIsFeeEditMode] = useState(false);
  const [currentFeeId, setCurrentFeeId] = useState<string | null>(null);
  const [feeForm, setFeeForm] = useState({
    feeType: "",
    amount: "",
    effectiveDate: new Date().toISOString().split("T")[0],
  });

  // Knowledge Base State
  const [knowledgeChunks, setKnowledgeChunks] = useState<Array<{ id: string; content: string; sourceCategory: string }>>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [policyTitle, setPolicyTitle] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [isUploadingKnowledge, setIsUploadingKnowledge] = useState(false);
  const [inspectingPolicy, setInspectingPolicy] = useState<{
    title: string;
    type: string;
    category: string;
    chunkCount: number;
    preview: string;
    clauses: Array<{ id: string; text: string }>;
  } | null>(null);

  // Group low-level vector chunks into clean high-level regulatory policy documents
  const groupedPolicies = useMemo(() => {
    const groups: Record<string, {
      title: string;
      type: string;
      category: string;
      chunkCount: number;
      preview: string;
      clauses: Array<{ id: string; text: string }>;
    }> = {};

    knowledgeChunks.forEach((chunk, idx) => {
      let title = "Official Statutory Policy";
      let type = "Official Circular / Gazette";
      let clauseText = chunk.content;

      const prefixMatch = chunk.content.match(/^\[(.*?) - (.*?)\]:\s*(.*)$/s);
      if (prefixMatch) {
        title = prefixMatch[2].trim();
        clauseText = prefixMatch[3].trim();
        type = "Official Circular / Gazette";
      } else if (chunk.content.includes("To apply for this service, citizens must provide")) {
        title = "Statutory Prerequisites & Required Documents";
        type = "Service Catalog Specification";
      } else if (chunk.content.startsWith("Fee schedule") || chunk.content.startsWith("Application form") || chunk.content.startsWith("Appointment policy")) {
        title = "Operational Fee & Appointment Rules";
        type = "Operational Rules";
      } else {
        title = chunk.sourceCategory || "Departmental Regulatory Document";
      }

      if (!groups[title]) {
        groups[title] = {
          title,
          type,
          category: chunk.sourceCategory || "Regulatory Document",
          chunkCount: 0,
          preview: clauseText.length > 220 ? clauseText.substring(0, 220) + "..." : clauseText,
          clauses: [],
        };
      }

      groups[title].chunkCount += 1;
      groups[title].clauses.push({
        id: chunk.id || `chunk-${idx}`,
        text: clauseText,
      });
    });

    return Object.values(groups);
  }, [knowledgeChunks]);

  const fetchTemplatesForService = async (svcId: string) => {
    if (!svcId) return;
    try {
      setIsLoadingWorkflow(true);
      const res = await fetch(`http://localhost:5119/api/templates/by-service/${svcId}`);
      if (res.ok) {
        const data = await res.json();
        setStageTemplates(data || []);
      }
      // Also refresh all templates
      fetchAllTemplates();
    } catch (e) {
      console.error("Error fetching templates for service:", e);
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!selectedServiceId) return;
    try {
      setIsSavingWorkflow(true);
      const depts = [...workflowDepartments];
      while (depts.length < totalStages) {
        depts.push("Civil Department");
      }
      const trimmedDepts = depts.slice(0, totalStages);

      const res = await fetch(`http://localhost:5119/api/services/${selectedServiceId}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalStages: totalStages,
          workflowDepartments: trimmedDepts,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save workflow");
      }

      setWorkflowDepartments(trimmedDepts);
      sessionStorage.setItem("admin_selected_service_id", selectedServiceId);
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("serviceId", selectedServiceId);
      currentUrl.searchParams.set("tab", "3");
      window.history.replaceState({}, "", currentUrl.toString());

      setNotification({
        type: "success",
        title: "Workflow Configuration Saved",
        subtitle: `Configured ${totalStages} sequential verification stage(s) across departments.`,
      });
      fetchTemplatesForService(selectedServiceId);
    } catch (e) {
      console.error(e);
      setNotification({
        type: "error",
        title: "Save Failed",
        subtitle: "Could not save workflow configuration. Check server connection.",
      });
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  const handleNavigateToBuilder = async (targetUrl: string) => {
    if (selectedServiceId) {
      try {
        const depts = [...workflowDepartments];
        while (depts.length < totalStages) {
          depts.push(AVAILABLE_DEPARTMENTS[depts.length % AVAILABLE_DEPARTMENTS.length] || "Civil Department");
        }
        const trimmedDepts = depts.slice(0, totalStages);
        await fetch(`http://localhost:5119/api/services/${selectedServiceId}/workflow`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            totalStages: totalStages,
            workflowDepartments: trimmedDepts,
          }),
        });
      } catch (err) {
        console.warn("Auto-saving workflow before builder navigation:", err);
      }
    }
    window.location.href = targetUrl;
  };

  const fetchKnowledge = async (svcId: string) => {
    if (!svcId) return;
    try {
      setKnowledgeLoading(true);
      const res = await fetch(`http://localhost:5119/api/RagSetup/service-knowledge/${svcId}`);
      if (res.ok) {
        const data = await res.json();
        setKnowledgeChunks(data);
      }
    } catch (e) {
      console.error("Error loading service knowledge:", e);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleUploadPolicy = async () => {
    if (!selectedServiceId || (!policyText.trim() && !policyFile)) {
      setNotification({
        type: "warning",
        title: "Missing Content",
        subtitle: "Please paste regulation text or choose a document file to vectorize.",
      });
      return;
    }

    try {
      setIsUploadingKnowledge(true);
      const formData = new FormData();
      formData.append("serviceProcedureId", selectedServiceId);
      formData.append("documentTitle", policyTitle || `${selectedServiceName} Official Regulation Document`);
      if (policyText.trim()) formData.append("policyText", policyText);
      if (policyFile) formData.append("file", policyFile);

      const res = await fetch("http://localhost:5119/api/RagSetup/upload-policy", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setNotification({
          type: "success",
          title: "Vectorized Successfully",
          subtitle: data.message || "Regulation document vectorized into Neon Vector DB!",
        });
        setPolicyTitle("");
        setPolicyText("");
        setPolicyFile(null);
        await fetchKnowledge(selectedServiceId);
      } else {
        const err = await res.text();
        setNotification({
          type: "error",
          title: "Upload Failed",
          subtitle: err || "Failed to vectorize document.",
        });
      }
    } catch (e) {
      console.error(e);
      setNotification({
        type: "error",
        title: "Network Error",
        subtitle: "Could not connect to the vectorization engine.",
      });
    } finally {
      setIsUploadingKnowledge(false);
    }
  };

  const handleClearKnowledge = async () => {
    if (!selectedServiceId) return;
    try {
      const res = await fetch(`http://localhost:5119/api/RagSetup/service-knowledge/${selectedServiceId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotification({
          type: "info",
          title: "Knowledge Reset",
          subtitle: "Vector chunks cleared for this service.",
        });
        setKnowledgeChunks([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleIngestLocalDocs = async () => {
    try {
      setIsUploadingKnowledge(true);
      const res = await fetch("http://localhost:5119/api/RagSetup/ingest-local-documents", {
        method: "POST",
      });
      if (res.ok) {
        setNotification({
          type: "success",
          title: "Sri Lankan Gazette Ingestion Complete",
          subtitle: "All 5 authentic Sri Lankan government policy documents vectorized into Neon Vector DB!",
        });
        await fetchKnowledge(selectedServiceId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploadingKnowledge(false);
    }
  };

  // 1. Fetch all services on mount
    useEffect(() => {
    fetch("http://localhost:5119/api/services")
      .then((res) => res.json())
      .then((data) => {
        const activeServices = data.filter((srv: ServiceOption) => srv.status === "Active");
        setServices(activeServices);
        const scopedServices = activeServices.filter(
          (srv: ServiceOption) => !deptAdminUser || !scopedCategory || srv.category === scopedCategory
        );

        const urlParams = new URLSearchParams(window.location.search);
        const urlSvcId = urlParams.get("serviceId");
        const savedSvcId = sessionStorage.getItem("admin_selected_service_id");

        let targetService: ServiceOption | undefined;
        if (urlSvcId) {
          targetService = scopedServices.find(
            (s: ServiceOption) => s.id.toString() === urlSvcId || s.serviceId === urlSvcId
          );
        }
        if (!targetService && savedSvcId) {
          targetService = scopedServices.find(
            (s: ServiceOption) => s.id.toString() === savedSvcId || s.serviceId === savedSvcId
          );
        }
        if (!targetService && scopedServices.length > 0) {
          targetService = scopedServices[0];
        }

        if (targetService) {
          setSelectedServiceId(targetService.id.toString());
          setSelectedServiceName(targetService.name);
          sessionStorage.setItem("admin_selected_service_id", targetService.id.toString());
        }
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching services:", error);
        setIsLoading(false);
      });
    fetchDepartments();
    fetchAllTemplates();
  }, [deptAdminUser, scopedCategory]);


  // 2. Fetch procedure details (documents and fees) when selected procedure changes
  useEffect(() => {
    if (!selectedServiceId) return;

    const loadConfig = async () => {
      const currentSrv = services.find(
        (s) => s.id.toString() === selectedServiceId,
      );
      if (currentSrv) {
        setSelectedServiceName(currentSrv.name);
      }

      setIsLoading(true);
      try {
        const res = await fetch(`http://localhost:5119/api/services/${selectedServiceId}`);
        const data = await res.json();
        const formattedDocs = (data.documentRequirements || []).map(
          (d: Omit<DocumentRequirement, "id"> & { id: number }) => ({
            ...d,
            id: d.id.toString(),
          }),
        );
        const formattedFees = (data.feeSchedules || []).map(
          (f: Omit<FeeSchedule, "id"> & { id: number }) => ({
            ...f,
            id: f.id.toString(),
          }),
        );
        setDocuments(formattedDocs);
        setFees(formattedFees);
        fetchKnowledge(selectedServiceId);

        // Load multi-department workflow stages
        const srvStages = data.totalStages || 1;
        setTotalStages(srvStages);
        setWorkflowType(srvStages > 1 ? "multiple" : "single");
        let srvDepts: string[] = [];
        if (Array.isArray(data.workflowDepartments)) {
          srvDepts = data.workflowDepartments;
        } else if (typeof data.workflowDepartments === "string") {
          try { srvDepts = JSON.parse(data.workflowDepartments); } catch {}
        }
        if (!srvDepts || srvDepts.length === 0) {
          srvDepts = ["Civil Department"];
        }
        setWorkflowDepartments(srvDepts);
        fetchTemplatesForService(selectedServiceId);
      } catch (error) {
        console.error("Error fetching service config:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [selectedServiceId, services]);

  // Document Handlers
  const openAddDocModal = () => {
    setIsDocEditMode(false);
    setCurrentDocId(null);
    setDocForm({ documentName: "", description: "", isMandatory: true });
    setIsDocModalOpen(true);
  };

  const openEditDocModal = (doc: DocumentRequirement) => {
    setIsDocEditMode(true);
    setCurrentDocId(doc.id);
    setDocForm({
      documentName: doc.documentName,
      description: doc.description === "—" ? "" : doc.description,
      isMandatory: doc.isMandatory,
    });
    setIsDocModalOpen(true);
  };

  const handleSaveDocument = async () => {
    if (!docForm.documentName) return;

    let updatedDocs = [...documents];
    if (isDocEditMode) {
      updatedDocs = updatedDocs.map((d) =>
        d.id === currentDocId ? { ...d, ...docForm } : d,
      );
    } else {
      const newDoc = {
        id: "0",
        serviceProcedureId: parseInt(selectedServiceId),
        ...docForm,
      };
      updatedDocs.push(newDoc);
    }

    try {
      const payload = updatedDocs.map((d) => ({
        id:
          !isNaN(Number(d.id)) && String(d.id).length < 15 ? parseInt(d.id) : 0,
        serviceProcedureId: parseInt(selectedServiceId),
        documentName: d.documentName,
        description: d.description,
        isMandatory: d.isMandatory,
      }));

      const response = await fetch(
        `http://localhost:5119/api/services/${selectedServiceId}/documents`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        const result = await response.json();
        setDocuments(
          (result.documentRequirements || []).map(
            (d: Omit<DocumentRequirement, "id"> & { id: number }) => ({
              ...d,
              id: d.id.toString(),
            }),
          ),
        );
        setIsDocModalOpen(false);
        setDocForm({ documentName: "", description: "", isMandatory: true });
        setNotification({
          type: "success",
          title: "Success",
          subtitle: "Document requirements updated successfully!",
        });
      } else {
        const errData = await response.json();
        setNotification({
          type: "error",
          title: "Database Error",
          subtitle: errData.message || "Failed to save documents.",
        });
      }
    } catch (error) {
      console.error("Error saving documents:", error);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!docId.startsWith("temp_") && !isNaN(Number(docId))) {
      try {
        await fetch(`http://localhost:5119/api/services/documents/${docId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Error deleting document from DB:", error);
      }
    }

    const updatedDocs = documents.filter((d) => d.id !== docId);
    setDocuments(updatedDocs);
    setNotification({
      type: "success",
      title: "Deleted",
      subtitle: "Document requirement removed successfully.",
    });
  };

  // Fee Handlers
  const openAddFeeModal = () => {
    setIsFeeEditMode(false);
    setCurrentFeeId(null);
    setFeeForm({
      feeType: "",
      amount: "",
      effectiveDate: new Date().toISOString().split("T")[0],
    });
    setIsFeeModalOpen(true);
  };

  const openEditFeeModal = (fee: FeeSchedule) => {
    setIsFeeEditMode(true);
    setCurrentFeeId(fee.id);
    setFeeForm({
      feeType: fee.feeType,
      amount: fee.amount.toString(),
      effectiveDate: fee.effectiveDate
        ? fee.effectiveDate.split("T")[0]
        : new Date().toISOString().split("T")[0],
    });
    setIsFeeModalOpen(true);
  };

  const handleSaveFee = async () => {
    let updatedFees = [...fees];
    if (isFeeEditMode) {
      updatedFees = updatedFees.map((f) =>
        f.id === currentFeeId
          ? { ...f, ...feeForm, amount: parseFloat(feeForm.amount) }
          : f,
      );
    } else {
      const newFee = {
        id: "0",
        serviceProcedureId: parseInt(selectedServiceId),
        feeType: feeForm.feeType,
        amount: parseFloat(feeForm.amount),
        effectiveDate: new Date(feeForm.effectiveDate).toISOString(),
      };
      updatedFees.push(newFee);
    }

    try {
      const payload = updatedFees.map((f) => ({
        id:
          !isNaN(Number(f.id)) && String(f.id).length < 15 ? parseInt(f.id) : 0,
        serviceProcedureId: parseInt(selectedServiceId),
        feeType: f.feeType,
        amount: f.amount,
        effectiveDate: new Date(f.effectiveDate).toISOString(),
      }));

      const response = await fetch(
        `http://localhost:5119/api/services/${selectedServiceId}/fees`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        const result = await response.json();
        setFees(
          (result.feeSchedules || []).map(
            (f: Omit<FeeSchedule, "id"> & { id: number }) => ({
              ...f,
              id: f.id.toString(),
            }),
          ),
        );
        setIsFeeModalOpen(false);
        setNotification({
          type: "success",
          title: "Success",
          subtitle: "Fee schedules updated successfully!",
        });
      }
    } catch (error) {
      console.error("Error saving fees:", error);
    }
  };

  const handleDeleteFee = async (feeId: string) => {
    if (!feeId.startsWith("temp_") && !isNaN(Number(feeId))) {
      try {
        await fetch(`http://localhost:5119/api/services/fees/${feeId}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.error("Error deleting fee from DB:", error);
      }
    }

    setFees(fees.filter((f) => f.id !== feeId));
    setNotification({
      type: "success",
      title: "Deleted",
      subtitle: "Fee schedule removed successfully.",
    });
  };

  const visibleServices = services.filter(
    (srv) => !deptAdminUser || !scopedCategory || srv.category === scopedCategory
  );

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    visibleServices.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats).sort();
  }, [visibleServices]);

  const filteredProcedureOptions = useMemo(() => {
    let list = visibleServices;
    if (selectedCategoryFilter !== "All") {
      list = list.filter((s) => s.category === selectedCategoryFilter);
    }
    if (serviceSearchQuery.trim()) {
      const q = serviceSearchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.serviceId.toLowerCase().includes(q) ||
          (s.category && s.category.toLowerCase().includes(q))
      );
    }
    return list;
  }, [visibleServices, selectedCategoryFilter, serviceSearchQuery]);

  const selectedService = useMemo(() => {
    return services.find((s) => s.id.toString() === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  useEffect(() => {
    if (filteredProcedureOptions.length > 0) {
      const isCurrentInFiltered = filteredProcedureOptions.some(
        (s) => s.id.toString() === selectedServiceId
      );
      if (!isCurrentInFiltered) {
        setSelectedServiceId(filteredProcedureOptions[0].id.toString());
      }
    }
  }, [filteredProcedureOptions, selectedServiceId]);

  const filteredDocs = documents.filter(
    (d) =>
      d.documentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredFees = fees.filter(
    (f) =>
      f.feeType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.amount?.toString().includes(searchQuery),
  );

  const handleLogout = async () => {
    const token = localStorage.getItem("officerToken");
    try {
      await fetch("http://localhost:5119/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      localStorage.removeItem("officerToken");
      localStorage.removeItem("officerUser");
      window.location.href = "/officer/login";
    }
  };

  return (
    <>
      <Header aria-label="Registry Admin System">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
          onClick={() => setIsSideNavExpanded((prev) => !prev)}
          isActive={isSideNavExpanded}
          isCollapsible
        />
        <HeaderName href="#" prefix="GSN">
          Registry Admin
        </HeaderName>
        <HeaderGlobalBar>
          <div
            className="w-[120px] sm:w-[200px] lg:w-[250px]"
            style={{
              marginRight: "1rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size="sm"
              id="search-config"
              labelText="Search"
              placeholder="Search records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
            />
          </div>
          <CurrentUserBadge />
          <HeaderGlobalAction aria-label="Notifications">
            <Notification size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>

        <SideNav
          aria-label="Side navigation"
          expanded={isSideNavExpanded}
          onOverlayClick={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <SideNavLink renderIcon={Dashboard} href={overviewHref}>
              Overview
            </SideNavLink>
            <SideNavLink renderIcon={Catalog} href="/admin/services">
              Service Catalog
            </SideNavLink>
            <SideNavLink renderIcon={Rule} href="/admin/services/rules">
              Eligibility Rules
            </SideNavLink>

            <SideNavLink
              renderIcon={Categories}
              href="/admin/services/config"
              isActive
            >
              Service Configuration
            </SideNavLink>
            <SideNavLink
              renderIcon={Document}
              href="/admin/services/builder"
            >
              Template Builder
            </SideNavLink>
            <SideNavLink renderIcon={Rule} href="/admin/services/simulator">
              Eligibility Simulator
            </SideNavLink>
            <SideNavLink
              renderIcon={Categories}
              href="/admin/departments"
            >
              Department Management
            </SideNavLink>
            <SideNavLink
              renderIcon={UserMultiple}
              href="/admin/manage-officers"
            >
              Manage Officers
            </SideNavLink>
            <SideNavLink renderIcon={Security} href="/admin/audit-logs">
              Audit Logs
            </SideNavLink>
            <SideNavLink renderIcon={Settings} href="/admin/system-settings">
              System Settings
            </SideNavLink>
            <div style={{ marginTop: "auto", borderTop: "1px solid #393939" }}>
              <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>
                Sign Out
              </SideNavLink>
            </div>
          </SideNavItems>
        </SideNav>
      </Header>

      <main
        className="mt-12 min-h-screen p-4 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64"
        style={{
          backgroundColor: "#f4f4f4",
        }}
      >
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 400, color: "#161616" }}>
            {selectedServiceName
              ? `Configure: ${selectedServiceName}`
              : "Service Configuration"}
          </h1>
          <p style={{ color: "#525252", marginTop: "0.5rem" }}>
            Manage document requirements and fee schedules for departmental
            services.
          </p>
        </div>

        {notification && (
          <div style={{ marginBottom: "1.5rem", width: "100%" }}>
            <InlineNotification
              kind={notification.type}
              title={notification.title}
              subtitle={notification.subtitle}
              onClose={() => setNotification(null)}
            />
          </div>
        )}

        <Tile
          style={{
            width: "100%",
            marginBottom: "1.5rem",
            padding: "1.25rem 1.5rem",
            backgroundColor: "#ffffff",
            borderRadius: "4px",
            border: "1px solid #e0e0e0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#161616",
                  margin: 0,
                }}
              >
                Select Target Service Procedure
              </h2>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "#525252",
                  marginTop: "0.25rem",
                  marginBottom: 0,
                }}
              >
                Search procedures by keyword/ID or filter by category to configure required documents, fees, policy knowledge, and stage workflows.
              </p>
            </div>
            {selectedService && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Tag type="blue" size="sm">
                  {selectedService.category || "General"}
                </Tag>
                <Tag type="cool-gray" size="sm">
                  {selectedService.serviceId}
                </Tag>
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
              alignItems: "flex-end",
            }}
          >
            {/* Search Input */}
            <div>
              <Search
                id="service-procedure-search"
                labelText="Search Procedures"
                placeholder="Search by code (e.g. GSN-IMM) or name..."
                size="md"
                value={serviceSearchQuery}
                onChange={(e) => setServiceSearchQuery(e.target.value)}
                onClear={() => setServiceSearchQuery("")}
              />
            </div>

            {/* Category Filter */}
            <div>
              <Select
                id="service-procedure-category-filter"
                labelText="Filter by Category"
                size="md"
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              >
                <SelectItem
                  value="All"
                  text={`All Categories (${visibleServices.length})`}
                />
                {availableCategories.map((cat) => (
                  <SelectItem
                    key={cat}
                    value={cat}
                    text={`${cat} (${visibleServices.filter((s) => s.category === cat).length})`}
                  />
                ))}
              </Select>
            </div>

            {/* Filtered Dropdown */}
            <div>
              <Select
                id="target-service-config-select"
                labelText={`Target Procedure (${filteredProcedureOptions.length} available)`}
                size="md"
                value={selectedServiceId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setSelectedServiceId(newId);
                  sessionStorage.setItem("admin_selected_service_id", newId);
                  const url = new URL(window.location.href);
                  url.searchParams.set("serviceId", newId);
                  window.history.replaceState({}, "", url.toString());
                }}
                disabled={filteredProcedureOptions.length === 0}
              >
                {filteredProcedureOptions.length === 0 ? (
                  <SelectItem value="" text="No matching procedures found" />
                ) : (
                  filteredProcedureOptions.map((srv) => (
                    <SelectItem
                      key={srv.id}
                      value={srv.id.toString()}
                      text={`${srv.serviceId} - ${srv.name}${srv.category ? ` (${srv.category})` : ""}`}
                    />
                  ))
                )}
              </Select>
            </div>
          </div>

          {/* Active Filter Bar & Reset */}
          {(serviceSearchQuery || selectedCategoryFilter !== "All") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "0.75rem",
                marginTop: "0.75rem",
                borderTop: "1px solid #f0f0f0",
                fontSize: "0.8125rem",
                color: "#525252",
              }}
            >
              <span>
                Showing <strong>{filteredProcedureOptions.length}</strong> of{" "}
                <strong>{visibleServices.length}</strong> procedures
                {serviceSearchQuery ? ` matching "${serviceSearchQuery}"` : ""}
                {selectedCategoryFilter !== "All"
                  ? ` in category "${selectedCategoryFilter}"`
                  : ""}
              </span>

              <Button
                kind="ghost"
                size="sm"
                onClick={() => {
                  setServiceSearchQuery("");
                  setSelectedCategoryFilter("All");
                }}
              >
                Reset Search & Filter
              </Button>
            </div>
          )}
        </Tile>

        <div style={{ width: "100%" }}>
          <Tabs
            selectedIndex={selectedTabIndex}
            onChange={({ selectedIndex }) => {
              setSelectedTabIndex(selectedIndex);
              const url = new URL(window.location.href);
              url.searchParams.set("tab", selectedIndex.toString());
              window.history.replaceState({}, "", url.toString());
            }}
          >
            <TabList aria-label="Configuration Tabs">
              <Tab>Required Documents</Tab>
              <Tab>Fee Schedule</Tab>
              <Tab>Official Policy & AI Knowledge Base</Tab>
              <Tab>Department Workflow & Stages</Tab>
            </TabList>
            <TabPanels>
              {/* Documents Tab */}
              <TabPanel
                style={{ padding: "2rem 0", backgroundColor: "transparent" }}
              >
                {isLoading ? (
                  <Loading
                    description="Loading documents..."
                    withOverlay={false}
                  />
                ) : (
                  <>
                    <DataTable rows={filteredDocs} headers={docHeaders}>
                      {({
                        rows,
                        headers,
                        getTableProps,
                        getHeaderProps,
                        getRowProps,
                      }) => (
                        <TableContainer
                          title="Document Checklist"
                          description="Files required from citizens for this specific procedure."
                        >
                          <Table {...getTableProps()}>
                            <TableHead>
                              <TableRow>
                                {headers.map((header) => (
                                  <TableHeader
                                    {...getHeaderProps({ header })}
                                    key={header.key}
                                  >
                                    {header.header}
                                  </TableHeader>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={headers.length}
                                    style={{
                                      textAlign: "center",
                                      padding: "2rem",
                                    }}
                                  >
                                    No document requirements configured for this
                                    procedure yet.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                rows.map((row) => (
                                  <TableRow
                                    {...getRowProps({ row })}
                                    key={row.id}
                                  >
                                    {row.cells.map((cell) => {
                                      if (cell.info.header === "isMandatory") {
                                        return (
                                          <TableCell key={cell.id}>
                                            <Tag
                                              type={cell.value ? "red" : "gray"}
                                            >
                                              {cell.value
                                                ? "Mandatory"
                                                : "Optional"}
                                            </Tag>
                                          </TableCell>
                                        );
                                      }
                                      if (cell.info.header === "actions") {
                                        const docItem = documents.find(
                                          (d) => d.id === row.id,
                                        );
                                        return (
                                          <TableCell key={cell.id}>
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: "0.5rem",
                                                alignItems: "center",
                                              }}
                                            >
                                              <Button
                                                size="sm"
                                                kind="tertiary"
                                                renderIcon={Edit}
                                                iconDescription="Edit"
                                                hasIconOnly
                                                onClick={() =>
                                                  docItem &&
                                                  openEditDocModal(docItem)
                                                }
                                              />
                                              <Button
                                                size="sm"
                                                kind="danger--ghost"
                                                renderIcon={TrashCan}
                                                iconDescription="Delete"
                                                hasIconOnly
                                                onClick={() =>
                                                  handleDeleteDocument(row.id)
                                                }
                                              />
                                            </div>
                                          </TableCell>
                                        );
                                      }
                                      return (
                                        <TableCell key={cell.id}>
                                          {cell.value || "—"}
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </DataTable>
                    <Button
                      kind="secondary"
                      renderIcon={Add}
                      style={{ marginTop: "1.5rem" }}
                      onClick={openAddDocModal}
                    >
                      Add Document Requirement
                    </Button>
                  </>
                )}
              </TabPanel>

              {/* Fee Schedule Tab */}
              <TabPanel
                style={{ padding: "2rem 0", backgroundColor: "transparent" }}
              >
                {isLoading ? (
                  <Loading description="Loading fees..." withOverlay={false} />
                ) : (
                  <>
                    <DataTable
                      rows={filteredFees.map((f) => ({
                        ...f,
                        id: f.id.toString(),
                        effectiveDate: f.effectiveDate
                          ? new Date(f.effectiveDate).toLocaleDateString()
                          : "—",
                      }))}
                      headers={feeHeaders}
                    >
                      {({
                        rows,
                        headers,
                        getTableProps,
                        getHeaderProps,
                        getRowProps,
                      }) => (
                        <TableContainer
                          title="Tiered Fee Structure"
                          description="Pricing tiers configured for this service."
                        >
                          <Table {...getTableProps()}>
                            <TableHead>
                              <TableRow>
                                {headers.map((header) => (
                                  <TableHeader
                                    {...getHeaderProps({ header })}
                                    key={header.key}
                                  >
                                    {header.header}
                                  </TableHeader>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={headers.length}
                                    style={{
                                      textAlign: "center",
                                      padding: "2rem",
                                    }}
                                  >
                                    No fee schedules configured for this
                                    service.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                rows.map((row) => (
                                  <TableRow
                                    {...getRowProps({ row })}
                                    key={row.id}
                                  >
                                    {row.cells.map((cell) => {
                                      if (cell.info.header === "actions") {
                                        const feeItem = fees.find(
                                          (f) => f.id === row.id,
                                        );
                                        return (
                                          <TableCell key={cell.id}>
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: "0.5rem",
                                                alignItems: "center",
                                              }}
                                            >
                                              <Button
                                                size="sm"
                                                kind="tertiary"
                                                renderIcon={Edit}
                                                iconDescription="Edit"
                                                hasIconOnly
                                                onClick={() =>
                                                  feeItem &&
                                                  openEditFeeModal(feeItem)
                                                }
                                              />
                                              <Button
                                                size="sm"
                                                kind="danger--ghost"
                                                renderIcon={TrashCan}
                                                iconDescription="Delete"
                                                hasIconOnly
                                                onClick={() =>
                                                  handleDeleteFee(row.id)
                                                }
                                              />
                                            </div>
                                          </TableCell>
                                        );
                                      }
                                      return (
                                        <TableCell key={cell.id}>
                                          {cell.value}
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </DataTable>
                    <Button
                      kind="secondary"
                      renderIcon={Add}
                      style={{ marginTop: "1.5rem" }}
                      onClick={openAddFeeModal}
                    >
                      Add Fee
                    </Button>
                  </>
                )}
              </TabPanel>

              {/* Tab 3: Official Policy & AI Knowledge Base (Neon Vector DB) */}
              <TabPanel style={{ padding: "1.5rem 0" }}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <h4 style={{ margin: 0, fontWeight: 600, fontSize: "1.15rem" }}>
                        Official Gazettes, Circulars & Dynamic Policy Ingestion
                      </h4>
                      <p style={{ margin: "0.4rem 0 0 0", color: "#525252", fontSize: "0.875rem", maxWidth: "800px" }}>
                        Upload official government circulars, statutory gazettes, or departmental rules for <strong>{selectedServiceName}</strong>.
                        The system parses the document, computes 768-dimensional semantic embeddings, and stores them in Neon PostgreSQL vector storage for real-time citizen AI guidance.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <Button
                        kind="tertiary"
                        size="md"
                        renderIcon={Renew}
                        disabled={isUploadingKnowledge}
                        onClick={handleIngestLocalDocs}
                      >
                        Ingest Sri Lankan Gazettes
                      </Button>
                      {knowledgeChunks.length > 0 && (
                        <Button
                          kind="danger--ghost"
                          size="md"
                          renderIcon={TrashCan}
                          disabled={isUploadingKnowledge}
                          onClick={handleClearKnowledge}
                        >
                          Clear Service Knowledge
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Upload & Vectorization Form */}
                <Tile style={{ marginBottom: "2rem", padding: "1.5rem", border: "1px solid #e0e0e0" }}>
                  <h5 style={{ margin: "0 0 1rem 0", fontWeight: 600, fontSize: "1rem" }}>
                    Ingest Official Circular or Regulatory Policy
                  </h5>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                    <TextInput
                      id="policy-title-input"
                      labelText="Document / Gazette Title"
                      placeholder="e.g. Gazette Extraordinary No. 2341/14 - Revised Passport & Biometric Regulations"
                      value={policyTitle}
                      onChange={(e) => setPolicyTitle(e.target.value)}
                    />

                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "#525252", marginBottom: "0.35rem", fontWeight: 500 }}>
                        Attach Gazette / Rule Document (.md, .txt, .pdf)
                      </label>
                      <input
                        id="policy-file-input"
                        type="file"
                        accept=".md,.txt,.pdf"
                        style={{
                          padding: "0.5rem",
                          border: "1px solid #8d8d8d",
                          backgroundColor: "#f4f4f4",
                          width: "100%",
                          borderRadius: "4px"
                        }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setPolicyFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>

                    <TextArea
                      id="policy-text-input"
                      labelText="Or Paste Official Policy Text / Legal Provisions directly"
                      placeholder="Paste statutory rules, mandatory prerequisites, counter requirements, medical guidelines, or fee provisions here..."
                      rows={5}
                      value={policyText}
                      onChange={(e) => setPolicyText(e.target.value)}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button
                        kind="primary"
                        renderIcon={Upload}
                        disabled={isUploadingKnowledge || (!policyText.trim() && !policyFile)}
                        onClick={handleUploadPolicy}
                      >
                        {isUploadingKnowledge ? "Vectorizing & Ingesting..." : "Vectorize & Ingest to Neon DB"}
                      </Button>
                    </div>
                  </div>
                </Tile>

                {/* Active Policy Knowledge Base & Documents Registry */}
                <div style={{ marginTop: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.2rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <h5 style={{ margin: 0, fontWeight: 600, fontSize: "1.1rem", color: "#161616" }}>
                          Active Policy Knowledge Registry
                        </h5>
                        <div style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          backgroundColor: "#defbe6",
                          color: "#0e6027",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}>
                          <span style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            backgroundColor: "#24a148",
                            boxShadow: "0 0 6px #24a148"
                          }} />
                          Neon pgvector: Active & Synced
                        </div>
                      </div>
                      <p style={{ margin: "0.25rem 0 0 0", color: "#525252", fontSize: "0.85rem" }}>
                        Official circulars, legal gazettes, and statutory rules indexed in Neon DB to power citizen AI reasoning.
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Tag type={groupedPolicies.length > 0 ? "teal" : "gray"}>
                        {groupedPolicies.length} Active Policies
                      </Tag>
                      <Tag type={knowledgeChunks.length > 0 ? "blue" : "gray"}>
                        {knowledgeChunks.length} Vector Segments
                      </Tag>
                    </div>
                  </div>

                  {knowledgeLoading ? (
                    <div style={{ padding: "3rem", textAlign: "center", backgroundColor: "#ffffff", borderRadius: "8px" }}>
                      <Loading description="Loading policy registry from Neon DB..." withOverlay={false} small />
                    </div>
                  ) : groupedPolicies.length === 0 ? (
                    <Tile style={{ padding: "2.5rem 1.5rem", textAlign: "center", backgroundColor: "#f4f4f4", border: "1px dashed #8d8d8d", borderRadius: "8px" }}>
                      <Document size={36} style={{ color: "#8d8d8d", marginBottom: "0.8rem" }} />
                      <p style={{ margin: 0, fontWeight: 600, color: "#161616", fontSize: "1rem" }}>
                        No regulatory policies indexed yet for {selectedServiceName || "this service"}.
                      </p>
                      <p style={{ margin: "0.5rem 0 1rem 0", color: "#6f6f6f", fontSize: "0.85rem", maxWidth: "560px", marginLeft: "auto", marginRight: "auto" }}>
                        Upload official departmental circulars, gazettes, or statutory guidelines above. 
                        Once ingested, the system automatically vectorizes the rules into Neon pgvector for AI agent consultation.
                      </p>
                      <Button
                        kind="tertiary"
                        size="sm"
                        renderIcon={Renew}
                        disabled={isUploadingKnowledge}
                        onClick={handleIngestLocalDocs}
                      >
                        Ingest Default Sri Lankan Gazettes
                      </Button>
                    </Tile>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {groupedPolicies.map((doc, index) => (
                        <Tile
                          key={doc.title || index}
                          style={{
                            padding: "1.4rem",
                            backgroundColor: "#ffffff",
                            borderRadius: "6px",
                            border: "1px solid #e0e0e0",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                            borderLeft: "4px solid #0f62fe"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.8rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <div style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "8px",
                                backgroundColor: "#edf5ff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}>
                                <Document size={20} style={{ color: "#0f62fe" }} />
                              </div>
                              <div>
                                <h6 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "#161616" }}>
                                  {doc.title}
                                </h6>
                                <span style={{ fontSize: "0.75rem", color: "#6f6f6f" }}>
                                  Source: {doc.category}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <Tag type={doc.type.includes("Gazette") ? "teal" : doc.type.includes("Catalog") ? "purple" : "blue"}>
                                {doc.type}
                              </Tag>
                              <Tag type="cool-gray">
                                {doc.chunkCount} {doc.chunkCount === 1 ? "Clause" : "Clauses"} Indexed
                              </Tag>
                              <div style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                fontSize: "0.75rem",
                                color: "#0e6027",
                                backgroundColor: "#defbe6",
                                padding: "0.15rem 0.5rem",
                                borderRadius: "10px",
                                fontWeight: 500,
                              }}>
                                <CheckmarkFilled size={12} style={{ fill: "#24a148" }} />
                                Vectorized
                              </div>
                            </div>
                          </div>

                          <div style={{
                            fontSize: "0.85rem",
                            color: "#393939",
                            backgroundColor: "#fbfbfb",
                            borderLeft: "3px solid #a6c8ff",
                            padding: "0.75rem 1rem",
                            borderRadius: "0 4px 4px 0",
                            lineHeight: "1.5",
                            marginBottom: "0.9rem",
                          }}>
                            {doc.preview}
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.4rem" }}>
                            <span style={{ fontSize: "0.75rem", color: "#8d8d8d" }}>
                              Embedding: HNSW Cosine Index • 768 Dimensions • Neon pgvector
                            </span>
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={View}
                              onClick={() => setInspectingPolicy(doc)}
                            >
                              Inspect Clauses ({doc.chunkCount})
                            </Button>
                          </div>
                        </Tile>
                      ))}
                    </div>
                  )}

                  {/* Modal to Inspect All Clauses of a Policy */}
                  {inspectingPolicy && (
                    <Modal
                      open
                      modalHeading={inspectingPolicy.title}
                      modalLabel={`Policy Document • ${inspectingPolicy.chunkCount} Vector Clauses`}
                      primaryButtonText="Close"
                      onRequestClose={() => setInspectingPolicy(null)}
                      onRequestSubmit={() => setInspectingPolicy(null)}
                      size="lg"
                    >
                      <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: "0.5rem" }}>
                        <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "#edf5ff", borderRadius: "4px", fontSize: "0.85rem", color: "#002d9c" }}>
                          <strong>Active Vector Knowledge:</strong> These clauses are embedded in your Neon Vector DB and are referenced by AI Agents to formulate step-by-step procedures and evaluate eligibility.
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
                          {inspectingPolicy.clauses.map((clause, cIdx) => (
                            <div
                              key={clause.id || cIdx}
                              style={{
                                padding: "0.9rem 1rem",
                                border: "1px solid #e0e0e0",
                                borderRadius: "4px",
                                backgroundColor: "#ffffff"
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                                <span style={{ fontWeight: 600, fontSize: "0.8rem", color: "#0f62fe" }}>
                                  Clause / Provision #{cIdx + 1}
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "#8d8d8d", fontFamily: "monospace" }}>
                                  ID: {clause.id.substring(0, 8)}...
                                </span>
                              </div>
                              <p style={{ margin: 0, fontSize: "0.85rem", color: "#161616", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>
                                {clause.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Modal>
                  )}
                </div>
              </TabPanel>

              {/* Tab 4: Multi-Department Workflow & Stages */}
              <TabPanel style={{ padding: "2rem 0", backgroundColor: "transparent" }}>
                <Tile style={{ marginBottom: "2rem", backgroundColor: "#fff", borderLeft: "4px solid #0f62fe" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <h4 style={{ margin: "0 0 0.5rem 0", fontWeight: 600, fontSize: "1.25rem" }}>
                        Multi-Department Verification Workflow
                      </h4>
                      <p style={{ margin: 0, color: "#525252", fontSize: "0.875rem", maxWidth: "680px" }}>
                        Configure sequential verification stages across different Sri Lankan ministries and departments. 
                        Applications progress sequentially: an officer in Stage 1 verifies initial credentials before Stage 2 is unlocked 
                        for the subsequent department.
                      </p>
                    </div>
                    <Button 
                      kind="primary" 
                      size="md" 
                      onClick={handleSaveWorkflow} 
                      disabled={isSavingWorkflow}
                    >
                      {isSavingWorkflow ? "Saving Workflow..." : "Save Workflow Configuration"}
                    </Button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem", marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid #e0e0e0" }}>
                    <div>
                      <Select
                        id="workflow-type-select"
                        labelText="Workflow Structure"
                        helperText="Choose whether this service requires a single stage or multiple sequential stages."
                        value={workflowType}
                        onChange={(e) => {
                          const type = e.target.value as "single" | "multiple";
                          setWorkflowType(type);
                          if (type === "single") {
                            setTotalStages(1);
                            setWorkflowDepartments((prev) => [prev[0] || "Civil Department"]);
                          } else {
                            const newTotal = totalStages > 1 ? totalStages : 2;
                            setTotalStages(newTotal);
                            const updated = [...workflowDepartments];
                            while (updated.length < newTotal) {
                              updated.push(AVAILABLE_DEPARTMENTS[updated.length % AVAILABLE_DEPARTMENTS.length] || "Civil Department");
                            }
                            setWorkflowDepartments(updated.slice(0, newTotal));
                          }
                        }}
                      >
                        <SelectItem value="single" text="Single Stage (One Department Review)" />
                        <SelectItem value="multiple" text="Multiple Stages (Sequential Department Workflow)" />
                      </Select>
                    </div>

                    {workflowType === "multiple" && (
                      <div>
                        <TextInput
                          id="totalStages-input"
                          type="number"
                          min={2}
                          max={50}
                          labelText="Number of Stages"
                          helperText="Enter the total number of sequential verification stages."
                          value={totalStages.toString()}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            const newTotal = isNaN(val) ? 2 : Math.max(2, val);
                            setTotalStages(newTotal);
                            const updated = [...workflowDepartments];
                            while (updated.length < newTotal) {
                              updated.push(AVAILABLE_DEPARTMENTS[updated.length % AVAILABLE_DEPARTMENTS.length] || "Civil Department");
                            }
                            setWorkflowDepartments(updated.slice(0, newTotal));
                          }}
                        />
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#525252", textTransform: "uppercase" }}>
                        Workflow Architecture Summary
                      </span>
                      <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        {Array.from({ length: totalStages }).map((_, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Tag type="blue">Stage {idx + 1}: {workflowDepartments[idx] || "Unassigned"}</Tag>
                            {idx < totalStages - 1 && <span style={{ color: "#8d8d8d", fontWeight: "bold" }}>➔</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tile>

                {/* Sequential Stage Cards */}
                <h4 style={{ margin: "0 0 1rem 0", fontWeight: 600, fontSize: "1.1rem" }}>
                  Department Assignment & Application Forms Per Stage
                </h4>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {Array.from({ length: totalStages }).map((_, idx) => {
                    const stageNum = idx + 1;
                    const stageDept = workflowDepartments[idx] || "Civil Department";
                    const templateForStage = stageTemplates.find((t) => t.stageOrder === stageNum);

                    // Find existing pre-built templates from Template Builder matching this department or service
                    const matchingPrebuilts = allAvailableTemplates.filter((t) => {
                      if (templateForStage && t.id === templateForStage.id) return false;
                      // Only Active templates are available for adoption (exclude Inactive / Deactive)
                      if (t.status === "Inactive" || t.status === "Deactive") return false;
                      const matchesDept = t.department && t.department.toLowerCase() === stageDept.toLowerCase();
                      const matchesService = t.serviceProcedureId && t.serviceProcedureId.toString() === selectedServiceId;
                      return matchesDept || matchesService;
                    });

                    return (
                      <Tile 
                        key={stageNum} 
                        style={{ 
                          padding: "1.5rem", 
                          backgroundColor: "#fff", 
                          border: templateForStage ? "1px solid #e0e0e0" : "1px dashed #da1e28",
                          borderRadius: "4px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                              <Tag type="blue" size="md">STAGE {stageNum}</Tag>
                              <Tag type={!templateForStage ? "red" : (templateForStage.status === "Inactive" || templateForStage.status === "Deactive") ? "magenta" : "green"}>
                                {!templateForStage 
                                  ? "Missing Application Form" 
                                  : (templateForStage.status === "Inactive" || templateForStage.status === "Deactive")
                                    ? "Form Deactivated"
                                    : "Form Linked"}
                              </Tag>
                              <span style={{ fontSize: "0.85rem", color: "#525252", fontWeight: 600 }}>
                                Handled by: {stageDept}
                              </span>
                            </div>

                            <p style={{ margin: 0, color: "#161616", fontWeight: 500, fontSize: "1rem" }}>
                              {templateForStage 
                                ? `${templateForStage.formName} - ${templateForStage.subTitle || "Stage Application Form"}`
                                : `Stage ${stageNum} Officer Verification Gate`
                              }
                            </p>
                            {templateForStage?.stageDescription && (
                              <p style={{ margin: "0.25rem 0 0 0", color: "#525252", fontSize: "0.85rem", fontStyle: "italic" }}>
                                Instructions: {templateForStage.stageDescription}
                              </p>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            {templateForStage ? (
                              <Button
                                kind="tertiary"
                                size="sm"
                                onClick={() => handleNavigateToBuilder(
                                  `/admin/services/builder?id=${templateForStage.id}&serviceId=${selectedServiceId}&stage=${stageNum}&department=${encodeURIComponent(stageDept)}`
                                )}
                              >
                                Edit Stage Form in Builder
                              </Button>
                            ) : (
                              <Button
                                kind="primary"
                                size="sm"
                                onClick={() => handleNavigateToBuilder(
                                  `/admin/services/builder?serviceId=${selectedServiceId}&stage=${stageNum}&department=${encodeURIComponent(stageDept)}`
                                )}
                              >
                                + Build Stage {stageNum} Form
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Adopt Pre-Built Template Option */}
                        {matchingPrebuilts.length > 0 && (
                          <div style={{ marginTop: "1.25rem", padding: "1rem", backgroundColor: "#edf5ff", border: "1px solid #a6c8ff", borderRadius: "4px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#0043ce", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                  Adopt Pre-built Template for {stageDept}
                                </span>
                                <Tag type="blue" size="sm">{matchingPrebuilts.length} Available in Builder</Tag>
                              </div>
                              <span style={{ fontSize: "0.75rem", color: "#525252" }}>
                                Customizing will save as an independent Stage {stageNum} copy. The original template in Template Builder will NOT be modified.
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ flex: 1, minWidth: "280px" }}>
                                <Select
                                  id={`adopt-template-${stageNum}`}
                                  labelText=""
                                  hideLabel
                                  size="md"
                                  value={selectedAdoptTemplatePerStage[stageNum] || ""}
                                  onChange={(e) => setSelectedAdoptTemplatePerStage((prev) => ({ ...prev, [stageNum]: e.target.value }))}
                                >
                                  <SelectItem value="" text="-- Select an existing template from Template Builder to customize --" />
                                  {matchingPrebuilts.map((t) => (
                                    <SelectItem
                                      key={t.id}
                                      value={t.id}
                                      text={`${t.formName} (${t.department || 'General'} • ${t.fields?.length || 0} fields)`}
                                    />
                                  ))}
                                </Select>
                              </div>
                              <Button
                                kind="secondary"
                                size="md"
                                disabled={!selectedAdoptTemplatePerStage[stageNum]}
                                onClick={() => {
                                  const selectedTplId = selectedAdoptTemplatePerStage[stageNum];
                                  handleNavigateToBuilder(
                                    `/admin/services/builder?cloneFromId=${selectedTplId}&serviceId=${selectedServiceId}&stage=${stageNum}&department=${encodeURIComponent(stageDept)}&clone=true`
                                  );
                                }}
                              >
                                Use & Customize for Stage {stageNum}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Stage Department Selector */}
                        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #f4f4f4", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                          <div style={{ minWidth: "320px", flex: 1 }}>
                            <Select
                              id={`stage-dept-${stageNum}`}
                              labelText={`Assigned Department for Stage ${stageNum}`}
                              value={stageDept}
                              onChange={(e) => {
                                const updated = [...workflowDepartments];
                                updated[idx] = e.target.value;
                                setWorkflowDepartments(updated);
                              }}
                            >
                              {departments.length > 0 ? (
                                departments.map((dept) => (
                                  <SelectItem key={dept.id} value={dept.name} text={`${dept.name} (${dept.departmentCode})`} />
                                ))
                              ) : (
                                AVAILABLE_DEPARTMENTS.map((dept) => (
                                  <SelectItem key={dept} value={dept} text={dept} />
                                ))
                              )}
                            </Select>
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#525252", maxWidth: "420px" }}>
                            Officers belonging to <strong>{stageDept}</strong> will automatically receive incoming applications at Stage {stageNum} in their queue.
                          </div>
                        </div>
                      </Tile>
                    );
                  })}
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>

        {/* Add/Edit Document Modal */}
        <Modal
          open={isDocModalOpen}
          modalHeading={
            isDocEditMode
              ? "Edit Document Requirement"
              : "Add Required Document"
          }
          primaryButtonText={isDocEditMode ? "Save Changes" : "Add Document"}
          secondaryButtonText="Cancel"
          onRequestClose={() => setIsDocModalOpen(false)}
          onRequestSubmit={handleSaveDocument}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
              paddingTop: "1rem",
            }}
          >
            <TextInput
              id="docName"
              labelText="Document Type Name"
              placeholder="e.g., National Identity Card (NIC)"
              value={docForm.documentName}
              onChange={(e) =>
                setDocForm({ ...docForm, documentName: e.target.value })
              }
            />
            <TextInput
              id="docDesc"
              labelText="Description / Instructions"
              placeholder="e.g., Front and back copy required"
              value={docForm.description}
              onChange={(e) =>
                setDocForm({ ...docForm, description: e.target.value })
              }
            />
            <Checkbox
              id="isMandatory"
              labelText="Mandatory Requirement"
              checked={docForm.isMandatory}
              onChange={(_, { checked }) =>
                setDocForm({ ...docForm, isMandatory: checked })
              }
            />
          </div>
        </Modal>

        {/* Add/Edit Fee Modal */}
        <Modal
          open={isFeeModalOpen}
          modalHeading={
            isFeeEditMode ? "Edit Fee Schedule" : "Add Fee Schedule"
          }
          primaryButtonText={isFeeEditMode ? "Save Changes" : "Add Fee"}
          secondaryButtonText="Cancel"
          onRequestClose={() => setIsFeeModalOpen(false)}
          onRequestSubmit={handleSaveFee}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
              paddingTop: "1rem",
            }}
          >
            <TextInput
              id="feeType"
              labelText="Fee Type"
              placeholder="e.g., Standard Processing Fee"
              value={feeForm.feeType}
              onChange={(e) =>
                setFeeForm({ ...feeForm, feeType: e.target.value })
              }
            />
            <TextInput
              id="feeAmount"
              labelText="Amount (LKR)"
              type="number"
              placeholder="e.g., 1500"
              value={feeForm.amount}
              onChange={(e) =>
                setFeeForm({ ...feeForm, amount: e.target.value })
              }
            />
            <TextInput
              id="feeEffectiveDate"
              labelText="Effective Date"
              type="date"
              value={feeForm.effectiveDate}
              onChange={(e) =>
                setFeeForm({ ...feeForm, effectiveDate: e.target.value })
              }
            />
          </div>
        </Modal>
      </main>
    </>
  );
}
