import '@carbon/styles/css/styles.css';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  Button,
  Grid,
  Column,
  TextArea,
  Select,
  SelectItem,
  InlineNotification,
  Tag,
  Pagination,
  Toggle
} from "@carbon/react";
import { Checkmark, Close, Document, ChevronLeft, ArrowRight, Warning, Money, Security, Task, CheckmarkFilled, WarningAltFilled } from "@carbon/icons-react";
import jsPDF from "jspdf";
import AgentDraftPanel from "./AgentDraftPanel";
import DocumentPreview from "./DocumentPreview";
import SupervisorCopilotBubble from "./SupervisorCopilotBubble";
import { getAgentDraft, generateAgentDraft, type AgentDraftView } from "./agentDraftApi";
import { API_BASE_URL, ApiError } from "../utils/api";
import { v } from "../utils/validation";

interface PaymentDetail {
  id?: number;
  hasPayment: boolean;
  amount: number;
  status: string;
  isVerified: boolean;
  method?: string;
  slipUrl?: string | null;
  paidDate?: string | null;
}

interface TaskDetail {
  task: {
    id: number;
    applicationId: number;
    status: string;
    referenceNumber: string;
    citizenName?: string | null;
    citizenNic?: string | null;
    serviceName?: string | null;
    department?: string | null;
    currentStage?: number;
    stageNumber?: number;
    maxStages?: number;
  };
  submittedAt?: string | null;
  userEmail?: string | null;
  answers: Record<string, string>;
  documents?: UploadedDocument[];
  payment?: PaymentDetail | null;
}

interface UploadedDocument {
  id: string;
  fieldLabel: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  category: 'stage' | 'payment' | 'other'; // tagged by backend
}

interface GalleryDocument {
  key: string;
  name: string;
  fieldLabel?: string;
  file?: UploadedDocument;
  aiTag: string;
  /** true = belongs to current stage → verify toggle active */
  isStageDoc: boolean;
  /** visual category label shown in gallery */
  docCategory: 'stage' | 'payment' | 'other' | 'missing';
}

function isDocumentAlreadyAttached(missingName: string, attached: GalleryDocument[]): boolean {
  const normMissing = missingName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normMissing) return false;

  return attached.some(att => {
    const label = (att.fieldLabel || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const name = (att.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact or substring match
    if (label && (label === normMissing || label.includes(normMissing) || normMissing.includes(label))) return true;
    if (name && (name === normMissing || name.includes(normMissing) || normMissing.includes(name))) return true;

    // Common acronyms & synonyms
    const isNicMissing = normMissing.includes('nic') || normMissing.includes('nationalidentity');
    const isNicAttached = label.includes('nic') || label.includes('nationalidentity') || name.includes('nic');
    if (isNicMissing && isNicAttached) return true;

    const isBcMissing = normMissing.includes('birth') || normMissing === 'bc';
    const isBcAttached = label.includes('birth') || name.includes('birth') || label === 'bc';
    if (isBcMissing && isBcAttached) return true;

    const isPayMissing = normMissing.includes('payment') || normMissing.includes('slip') || normMissing.includes('deposit') || normMissing.includes('receipt') || normMissing.includes('fee');
    const isPayAttached = label.includes('payment') || label.includes('slip') || label.includes('deposit') || label.includes('receipt') || label.includes('fee') || att.docCategory === 'payment';
    if (isPayMissing && isPayAttached) return true;

    return false;
  });
}

export default function VerificationWorkspace() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [decision, setDecision] = useState<string>("");
  const [comments, setComments] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [rejectionReasons, setRejectionReasons] = useState<{id: number, code: string, description: string}[]>([]);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [agentDraft, setAgentDraft] = useState<AgentDraftView | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentError, setAgentError] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<"copilot" | "application" | "decision">("copilot");

  // Document Gallery State: files the citizen uploaded, plus documents the agents flagged as missing
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [verifiedDocKeys, setVerifiedDocKeys] = useState<Set<string>>(new Set());

  const documents = useMemo<GalleryDocument[]>(() => {
    const uploaded = detail?.documents ?? [];

    let attached: GalleryDocument[];
    if (uploaded.length > 0) {
      // The officer ONLY reviews:
      // 1. Current stage documents (category === 'stage')
      // 2. Active statutory payment slip for this current stage (category === 'payment')
      const stageDocs = uploaded.filter(d => d.category === 'stage');
      const paymentDocs = uploaded.filter(d => d.category === 'payment');

      // Pick at most ONE active payment slip (matching detail.payment.slipUrl, or newest upload)
      // Only include payment slip if this stage actually requires a statutory payment
      const activeSlip = detail?.payment?.hasPayment
        ? (paymentDocs.find(d => detail?.payment?.slipUrl && detail.payment.slipUrl.includes(d.id))
          ?? (paymentDocs.length > 0 ? paymentDocs[paymentDocs.length - 1] : null))
        : null;
      const otherDocs = uploaded.filter(d => d.category !== 'stage' && d.category !== 'payment');
      const relevant = activeSlip ? [...stageDocs, activeSlip, ...otherDocs] : [...stageDocs, ...otherDocs];
      const order: Record<string, number> = { stage: 0, payment: 1, other: 2 };
      const sorted = [...relevant].sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99));

      attached = sorted.map(d => ({
        key: d.id,
        name: d.fileName,
        fieldLabel: d.fieldLabel,
        file: d,
        aiTag: d.category === 'payment' ? 'Payment slip' : 'Submitted by citizen',
        isStageDoc: d.category === 'stage',
        docCategory: d.category,
      }));
    } else {
      // Legacy: no stored files — fall back to agent-seen names, treat all as stage
      attached = (agentDraft?.action.draft?.attachedDocumentNames ?? []).map(name => ({
        key: `name:${name}`,
        name,
        aiTag: 'Submitted by citizen',
        isStageDoc: true,
        docCategory: 'stage' as const,
      }));
    }

    // Missing docs flagged by agent — only for the current stage AND only if NOT already uploaded!
    const missing: GalleryDocument[] = (agentDraft?.eligibility.missingDocuments ?? [])
      .filter(name => !isDocumentAlreadyAttached(name, attached))
      .map(name => ({
        key: `missing:${name}`,
        name,
        aiTag: 'Missing (flagged by agent)',
        isStageDoc: false,
        docCategory: 'missing' as const,
      }));

    return [...attached, ...missing];
  }, [detail, agentDraft]);

  // Clamp the index when the document list shrinks (adjusted during render, not in an effect)
  if (currentDocIndex >= documents.length && documents.length > 0) {
    setCurrentDocIndex(documents.length - 1);
  }

  const applyAgentDraft = (view: AgentDraftView) => {
    setAgentDraft(view);
    setCurrentDocIndex(0);
  };

  // Backend returns { message, details } on agent failures; show the details so the officer knows what went wrong
  const describeAgentError = (e: unknown) => {
    const fallback = "The AI agents could not prepare a draft for this application.";
    if (!(e instanceof ApiError)) return fallback;
    try {
      const body = JSON.parse(e.body);
      return body.details ? `${fallback} ${body.details}` : fallback;
    } catch {
      return e.status === 404 ? e.message : fallback;
    }
  };

  // Agent 2 + Agent 3 output: load the stored draft, or run the agents the first time the task is opened
  useEffect(() => {
    if (!taskId) return;
    const loadAgentDraft = async () => {
      try {
        const stored = await getAgentDraft(taskId);
        applyAgentDraft(stored ?? await generateAgentDraft(taskId));
      } catch (e) {
        console.error("Failed to load agent draft", e);
        setAgentError(describeAgentError(e));
      } finally {
        setAgentLoading(false);
      }
    };
    loadAgentDraft();
  }, [taskId]);

  const regenerateAgentDraft = async () => {
    if (!taskId) return;
    setAgentLoading(true);
    setAgentError("");
    try {
      applyAgentDraft(await generateAgentDraft(taskId));
    } catch (e) {
      console.error("Failed to re-run agents", e);
      setAgentError(describeAgentError(e));
    } finally {
      setAgentLoading(false);
    }
  };

  useEffect(() => {
    if (!taskId) return;
    const fetchDetail = async () => {
      try {
        const token = localStorage.getItem("officerToken");
        const response = await fetch(`${API_BASE_URL}/api/Verification/tasks/${taskId}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
        if (response.ok) {
          const data: TaskDetail = await response.json();
          setDetail(data);
          if (data.task?.status && data.task.status !== "Pending") {
            setDecision(data.task.status === "Revised" ? "Revision Requested" : data.task.status);
          }
        } else {
          setDetailError(response.status === 404 ? "Application not found." : "Failed to load application.");
        }
      } catch (e) {
        console.error("Failed to fetch task detail", e);
        setDetailError("Failed to load application.");
      }
    };
    fetchDetail();
  }, [taskId]);

  useEffect(() => {
    const fetchReasons = async () => {
      try {
        const token = localStorage.getItem("officerToken");
        const response = await fetch(`${API_BASE_URL}/api/Verification/rejection-reasons`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        if (response.ok) {
          const data = await response.json();
          setRejectionReasons(data);
        }
      } catch (e) {
        console.error("Failed to fetch rejection reasons", e);
      }
    };
    fetchReasons();
  }, []);


  const currentDoc = documents[currentDocIndex];
  const currentDocVerified = currentDoc ? verifiedDocKeys.has(currentDoc.key) : false;

  const handleDocumentVerificationToggle = (checked: boolean) => {
    if (!currentDoc) return;
    setVerifiedDocKeys(keys => {
      const next = new Set(keys);
      if (checked) next.add(currentDoc.key); else next.delete(currentDoc.key);
      return next;
    });
  };

  const handleDecision = async (status: string) => {
    if (status === "Approved" && detail?.payment?.hasPayment && !detail.payment.isVerified) {
      alert("Cannot complete stage as verified: Statutory payment has not been verified by the Department Finance Officer.");
      return;
    }
    setDecision(status);
    setWorkspaceTab("decision");
    if (status === "Approved") {
      await submitDecision(status);
    }
  };

  const submitDecision = async (status: string) => {
    if (status === "Approved" && detail?.payment?.hasPayment && !detail.payment.isVerified) {
      alert("Cannot complete stage as verified: Statutory payment has not been verified by the Department Finance Officer.");
      return;
    }
    if ((status === "Rejected" || status === "Revision Requested") && (!comments.trim() && !reasonId)) {
      alert("Please provide a reason or comments for rejection/revision.");
      return;
    }
    // Same limit as the backend's VerificationDecisionRequest
    const commentsError = v.text("Comments", { max: 2000, required: false })(comments);
    if (commentsError) {
      alert(commentsError);
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("idle");
    
    const token = localStorage.getItem("officerToken");
    const activeStage = (detail?.task.stageNumber && detail.task.stageNumber > 0)
      ? detail.task.stageNumber
      : (detail?.task.currentStage ?? 1);
    const maxStages = detail?.task.maxStages ?? 1;
    const isMultiStage = maxStages > activeStage;

    try {
      const endpoint = (status === "Approved" && isMultiStage)
        ? `${API_BASE_URL}/api/Verification/tasks/${taskId}/approve-stage`
        : `${API_BASE_URL}/api/Verification/tasks/${taskId}/decision`;

      const payload = (status === "Approved" && isMultiStage)
        ? { notes: comments || "Milestone approved by officer" }
        : {
            status: status === "Revision Requested" ? "Revised" : status,
            comments: comments,
            rejectionReasonId: reasonId ? parseInt(reasonId) : null
          };

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const nextStageNum = (isMultiStage && status === "Approved") ? activeStage + 1 : activeStage;
        const finalStatus = status === "Revision Requested" ? "Revised" : status;
        setDetail(prev => prev ? {
          ...prev,
          task: {
            ...prev.task,
            status: finalStatus,
            currentStage: nextStageNum,
            stageNumber: nextStageNum,
          },
        } : prev);
        setDecision(status);
        setSubmitStatus("success");
        setTimeout(() => navigate('/officer/pending-reviews'), 2000);
      } else {
        setSubmitStatus("error");
      }
    } catch {
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportPdf = () => {
    if (!detail) return;
    const doc = new jsPDF();
    const marginX = 15;
    let y = 18;

    // Header banner
    doc.setFillColor(15, 98, 254);
    doc.rect(0, 0, 210, 10, 'F');

    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 22, 22);
    doc.text("Government Service Navigator - Verification Dossier", marginX, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(82, 82, 82);
    doc.text(`Official Application Verification & Statutory Audit Dossier | Generated: ${new Date().toLocaleString()}`, marginX, y);
    y += 6;

    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, 195, y);
    y += 8;

    // Summary Box
    doc.setFillColor(244, 244, 244);
    doc.rect(marginX, y, 180, 44, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(marginX, y, 180, 44, 'S');

    doc.setFontSize(9);
    doc.setTextColor(22, 22, 22);

    const refNo = detail.task.referenceNumber || `APP-${detail.task.applicationId}`;
    const citName = detail.task.citizenName || "N/A";
    const citNic = detail.task.citizenNic || "N/A";
    const srvName = detail.task.serviceName || "Public Service";
    const deptName = detail.task.department || "General Department";
    const stageNum = detail.task.stageNumber || detail.task.currentStage || 1;
    const maxStg = detail.task.maxStages || 1;
    const statusText = detail.task.status || "Under Verification";

    doc.setFont("helvetica", "bold");
    doc.text("Reference No:", marginX + 4, y + 8);
    doc.setFont("helvetica", "normal");
    doc.text(refNo, marginX + 34, y + 8);

    doc.setFont("helvetica", "bold");
    doc.text("Citizen NIC:", marginX + 96, y + 8);
    doc.setFont("helvetica", "normal");
    doc.text(citNic, marginX + 124, y + 8);

    doc.setFont("helvetica", "bold");
    doc.text("Citizen Name:", marginX + 4, y + 17);
    doc.setFont("helvetica", "normal");
    doc.text(citName, marginX + 34, y + 17);

    doc.setFont("helvetica", "bold");
    doc.text("Email:", marginX + 96, y + 17);
    doc.setFont("helvetica", "normal");
    doc.text(detail.userEmail || "N/A", marginX + 124, y + 17);

    doc.setFont("helvetica", "bold");
    doc.text("Service:", marginX + 4, y + 26);
    doc.setFont("helvetica", "normal");
    doc.text(srvName.length > 34 ? srvName.substring(0, 31) + "..." : srvName, marginX + 34, y + 26);

    doc.setFont("helvetica", "bold");
    doc.text("Department:", marginX + 96, y + 26);
    doc.setFont("helvetica", "normal");
    doc.text(deptName.length > 25 ? deptName.substring(0, 22) + "..." : deptName, marginX + 124, y + 26);

    doc.setFont("helvetica", "bold");
    doc.text("Workflow Stage:", marginX + 4, y + 35);
    doc.setFont("helvetica", "normal");
    doc.text(`Stage ${stageNum} of ${maxStg}`, marginX + 34, y + 35);

    doc.setFont("helvetica", "bold");
    doc.text("Current Status:", marginX + 96, y + 35);
    doc.setFont("helvetica", "normal");
    doc.text(statusText, marginX + 124, y + 35);

    y += 52;

    // Statutory Fee & Payment Section
    if (detail.payment) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Statutory Fee Verification", marginX, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const payState = detail.payment.isVerified ? "VERIFIED & POSTED" : detail.payment.status;
      doc.text(`Amount: Rs. ${detail.payment.amount.toFixed(2)} | Method: ${detail.payment.method || "Online"} | Status: ${payState}`, marginX, y);
      y += 10;
    }

    // Citizen Form Answers Section
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Citizen Submitted Application Fields", marginX, y);
    y += 6;

    const answers = Object.entries(detail.answers || {});
    if (answers.length === 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("No custom form answers submitted.", marginX, y);
      y += 8;
    } else {
      doc.setFontSize(8.5);
      for (const [key, val] of answers) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const label = `${key}:`;
        const strVal = String(val || "-");
        if (label.length > 25) {
          doc.setFont("helvetica", "bold");
          doc.text(label, marginX + 4, y);
          y += 4.5;
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(strVal, 125);
          doc.text(lines, marginX + 8, y);
          y += (lines.length * 4.5) + 1.5;
        } else {
          doc.setFont("helvetica", "bold");
          doc.text(label, marginX + 4, y);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(strVal, 125);
          doc.text(lines, marginX + 60, y);
          y += Math.max(5.5, (lines.length * 4.5) + 1.5);
        }
      }
      y += 4;
    }

    // Documents Section
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Supporting Verification Documents", marginX, y);
    y += 6;

    const docs = detail.documents || [];
    if (docs.length === 0) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("No attached documents uploaded for this stage.", marginX, y);
      y += 8;
    } else {
      doc.setFontSize(8.5);
      for (const d of docs) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        const label = `• ${d.fieldLabel || d.fileName}:`;
        const sizeKb = (d.sizeBytes / 1024).toFixed(1);
        const val = `${d.fileName} (${sizeKb} KB, Category: ${d.category})`;
        if (label.length > 25) {
          doc.setFont("helvetica", "bold");
          doc.text(label, marginX + 4, y);
          y += 4.5;
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(val, 125);
          doc.text(lines, marginX + 8, y);
          y += (lines.length * 4.5) + 1.5;
        } else {
          doc.setFont("helvetica", "bold");
          doc.text(label, marginX + 4, y);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(val, 125);
          doc.text(lines, marginX + 60, y);
          y += Math.max(5.5, (lines.length * 4.5) + 1.5);
        }
      }
      y += 6;
    }

    // Verification Officer Sign-off Block
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    y += 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(marginX, y, 195, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Verification Officer Sign-off & Audit Record", marginX, y);
    y += 14;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text("Verifying Officer Signature: __________________________", marginX, y);
    doc.text("Date & Official Seal: __________________________", marginX + 100, y);

    const safeRef = refNo.replace(/[^a-zA-Z0-9_-]/g, "_");
    doc.save(`GSN_Verification_Dossier_${safeRef}.pdf`);
  };

  return (
    <>
      <Header aria-label="Registry Portal System">
            <HeaderName href="#" prefix="GSN">
              Workspace
            </HeaderName>
            <HeaderGlobalBar style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingRight: '0.5rem' }}>
               <Button
                 kind="secondary"
                 size="sm"
                 renderIcon={Document}
                 onClick={handleExportPdf}
                 style={{ whiteSpace: 'nowrap' }}
               >
                 <span className="hidden sm:inline">Export to PDF</span>
                 <span className="sm:hidden">Export PDF</span>
               </Button>
               <Button 
                 kind="ghost" 
                 size="sm" 
                 renderIcon={ChevronLeft} 
                 onClick={() => navigate('/officer/pending-reviews')}
                 style={{ whiteSpace: 'nowrap' }}
               >
                 <span className="hidden sm:inline">Back to Queue</span>
                 <span className="sm:hidden">Back</span>
               </Button>
            </HeaderGlobalBar>
          </Header>

          <main className="mt-12 min-h-screen p-4 min-[66rem]:p-8" style={{ backgroundColor: '#f4f4f4' }}>
            <Grid fullWidth>
              {/* Left Column: Document Gallery */}
              <Column sm={4} md={5} lg={9} style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', padding: '1rem', minHeight: '80vh' }}>
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Submitted Documents</h2>
                    <p style={{ fontSize: '0.875rem', color: '#525252' }}>
                      Swipe to review all uploads. Verify toggle is active for current-stage documents only.
                    </p>
                  </div>
                  {currentDoc && currentDoc.isStageDoc && currentDoc.docCategory === 'stage' && (
                  <div style={{ backgroundColor: currentDocVerified ? '#defbe6' : '#fff', padding: '0.5rem 1rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                     <Toggle
                        id="doc-verify-toggle"
                        size="sm"
                        labelA="Unverified"
                        labelB="Verified"
                        toggled={currentDocVerified}
                        onToggle={handleDocumentVerificationToggle}
                     />
                  </div>
                  )}
                  {currentDoc && (!currentDoc.isStageDoc || currentDoc.docCategory !== 'stage') && (
                  <div style={{ padding: '0.5rem 1rem', border: '1px solid #e0e0e0', borderRadius: '4px', color: currentDoc.docCategory === 'missing' ? '#da1e28' : '#8d8d8d', fontSize: '0.75rem', fontWeight: currentDoc.docCategory === 'missing' ? 600 : 400 }}>
                    {currentDoc.docCategory === 'payment'
                      ? '💳 Payment slip — view only'
                      : currentDoc.docCategory === 'missing'
                      ? '⚠️ Missing document — not uploaded'
                      : '📄 Other stage — view only'}
                  </div>
                  )}
                </div>
                
                <div style={{ backgroundColor: '#f4f4f4', minHeight: '550px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #c6c6c6' }}>
                  {!currentDoc ? (
                  <div style={{ textAlign: 'center', color: '#525252' }}>
                     <Document size={48} style={{ margin: '0 auto 1rem' }} />
                     <p>{agentLoading ? "Loading documents…" : "No documents were attached or flagged for this application."}</p>
                  </div>
                  ) : (
                  <div style={{ textAlign: 'center', color: '#525252', width: '100%', padding: '1rem' }}>
                     {currentDoc.file ? (
                        <DocumentPreview key={currentDoc.file.id} documentId={currentDoc.file.id} fileName={currentDoc.file.fileName} contentType={currentDoc.file.contentType} />
                     ) : (
                        <Document size={48} style={{ margin: '0 auto 1rem' }} />
                     )}
                     <p style={{ fontSize: '1.25rem', margin: '0.75rem 0 0.25rem' }}>{currentDoc.name}</p>
                     {currentDoc.fieldLabel && <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{currentDoc.fieldLabel}</p>}
                     <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                       <Tag type={
                         currentDoc.docCategory === 'missing' ? 'red'
                         : currentDoc.docCategory === 'payment' ? 'purple'
                         : currentDoc.docCategory === 'other' ? 'cool-gray'
                         : 'blue'
                       }>
                         {currentDoc.aiTag}
                       </Tag>
                       {currentDoc.docCategory === 'stage' && (
                         <Tag type="green">Stage document</Tag>
                       )}
                       {currentDoc.docCategory === 'payment' && (
                         <Tag type="purple">Payment slip — view only</Tag>
                       )}
                       {currentDoc.docCategory === 'other' && (
                         <Tag type="cool-gray">Other stage — view only</Tag>
                       )}
                     </div>
                     {currentDocVerified && currentDoc.isStageDoc && (
                        <div style={{ marginTop: '1rem', color: '#198038', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                           <Checkmark size={20} />
                           <span style={{ fontWeight: 600 }}>Marked as Verified manually</span>
                        </div>
                     )}
                  </div>
                  )}
                </div>

                <div style={{ marginTop: '1rem' }}>
                   <Pagination
                      backwardText="Previous Document"
                      forwardText="Next Document"
                      itemsPerPageText=""
                      page={currentDocIndex + 1}
                      pageSize={1}
                      pageSizes={[1]}
                      totalItems={Math.max(documents.length, 1)}
                      onChange={({ page }) => setCurrentDocIndex(page - 1)}
                   />
                </div>
              </Column>

              {/* Right Column: Reasoning & Decision Panel */}
              <Column sm={4} md={3} lg={7} style={{ padding: '0 1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 300 }}>Application Review</h2>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {agentDraft && (() => {
                      const isEligible = agentDraft.eligibility?.isEligible ?? true;
                      const hasDocDeficiencies = !isEligible || (agentDraft.eligibility?.missingDocuments?.length ?? 0) > 0 || (agentDraft.eligibility?.matchPercentage ?? 100) < 70;
                      const rawRisk = agentDraft.validation?.riskLevel?.toLowerCase() ?? '';
                      const isHigh = rawRisk.includes('high') || rawRisk.includes('critical');
                      const isMedium = !isHigh && (rawRisk.includes('medium') || hasDocDeficiencies || agentDraft.validation?.isValid === false);

                      return (
                        <Tag
                          type={isHigh ? 'red' : isMedium ? 'warm-gray' : 'green'}
                          style={{ fontWeight: 600, fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isHigh ? (
                            <>
                              <WarningAltFilled size={14} />
                              <span>High Risk Compliance Alert</span>
                            </>
                          ) : isMedium ? (
                            <>
                              <Warning size={14} />
                              <span>Action Required / Incomplete Submission</span>
                            </>
                          ) : (
                            <>
                              <CheckmarkFilled size={14} />
                              <span>Statutory Verification Passed</span>
                            </>
                          )}
                        </Tag>
                      );
                    })()}
                    {detail?.task.maxStages && detail.task.maxStages > 1 && (
                      <Tag type="teal">
                        Stage {detail.task.currentStage ?? 1} of {detail.task.maxStages}
                      </Tag>
                    )}
                    {detail?.task.status && (
                      <Tag
                        type={
                          detail.task.status === "Approved"
                            ? "green"
                            : detail.task.status === "Rejected"
                              ? "red"
                              : detail.task.status === "Revised" || detail.task.status === "Revision Requested"
                                ? "warm-gray"
                                : "blue"
                        }
                        style={{ fontWeight: 700, fontSize: "0.8125rem" }}
                      >
                        {detail.task.status === "Approved"
                          ? "✓ Approved"
                          : detail.task.status === "Rejected"
                            ? "✕ Rejected"
                            : detail.task.status === "Revised" || detail.task.status === "Revision Requested"
                              ? "⚠ Revision Requested"
                              : "● Pending Review"}
                      </Tag>
                    )}
                  </div>
                </div>

                {submitStatus === "success" && (
                  <InlineNotification
                    kind="success"
                    title="Official Determination Recorded"
                    subtitle={`Determination "${detail?.task.status || decision}" saved successfully. Returning to review queue in a moment...`}
                    hideCloseButton
                    style={{ marginBottom: "1rem" }}
                  />
                )}
                {submitStatus === "error" && (
                  <InlineNotification
                    kind="error"
                    title="Error Saving Determination"
                    subtitle="Failed to record determination on the server. Please check your connection or officer permissions and try again."
                    hideCloseButton
                    style={{ marginBottom: "1rem" }}
                  />
                )}

                <div style={{ marginBottom: '1.25rem', backgroundColor: '#fff', padding: '0.875rem 1rem', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <div><span style={{ color: '#525252' }}>App ID:</span> <strong>{detail?.task.referenceNumber ?? "—"}</strong></div>
                    <div><span style={{ color: '#525252' }}>Citizen:</span> <strong>{detail?.task.citizenName || "—"}</strong>{detail?.task.citizenNic ? ` (${detail.task.citizenNic})` : ""}</div>
                    <div><span style={{ color: '#525252' }}>Service:</span> <strong>{detail?.task.serviceName || "—"}</strong></div>
                    {detail?.submittedAt && (
                      <div><span style={{ color: '#525252' }}>Submitted:</span> <strong>{new Date(detail.submittedAt).toLocaleString()}</strong></div>
                    )}
                  </div>
                </div>

                {detailError && (
                  <InlineNotification kind="error" title="Error" subtitle={detailError} hideCloseButton lowContrast style={{ marginBottom: '1rem' }} />
                )}

                {/* Statutory Payment Status Banner (Synchronized with Finance Officer Audit) */}
                {detail?.payment && detail.payment.hasPayment && (
                  <div
                    style={{
                      backgroundColor: detail.payment.isVerified
                        ? '#f6fcf7'
                        : detail.payment.status === 'PendingVerification'
                        ? '#fcfbf6'
                        : '#fff8f8',
                      border: '1px solid',
                      borderColor: detail.payment.isVerified
                        ? '#a7f0ba'
                        : detail.payment.status === 'PendingVerification'
                        ? '#f1c21b'
                        : '#ffb3b8',
                      borderLeft: detail.payment.isVerified
                        ? '5px solid #198038'
                        : detail.payment.status === 'PendingVerification'
                        ? '5px solid #f1c21b'
                        : '5px solid #da1e28',
                      padding: '0.875rem 1.125rem',
                      borderRadius: '4px',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px' }}>
                      <Money
                        size={22}
                        color={
                          detail.payment.isVerified
                            ? '#198038'
                            : detail.payment.status === 'PendingVerification'
                            ? '#b28600'
                            : '#da1e28'
                        }
                      />
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: detail.payment.isVerified ? '#0e6027' : '#161616' }}>
                          {detail.payment.isVerified
                            ? `✓ Statutory Payment Verified: LKR ${detail.payment.amount?.toLocaleString()}`
                            : detail.payment.status === 'PendingVerification'
                            ? `⏳ Statutory Payment Awaiting Finance Audit: LKR ${detail.payment.amount?.toLocaleString()}`
                            : `⚠ Statutory Payment Outstanding: LKR ${detail.payment.amount?.toLocaleString()}`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#525252', marginTop: '2px' }}>
                          {detail.payment.isVerified
                            ? `Payment has been audited and cleared by the Department Finance Officer (${detail.payment.method || 'Bank Deposit / Online'}). This stage is unlocked for final verification.`
                            : detail.payment.status === 'PendingVerification'
                            ? `Citizen uploaded bank deposit slip for Stage ${detail.task.currentStage}. Department Finance Officer review is pending. Stage approval is locked until cleared.`
                            : `Statutory fee payment is pending from the citizen for Stage ${detail.task.currentStage}. Stage verification approval is locked.`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Tag
                        type={
                          detail.payment.isVerified
                            ? 'green'
                            : detail.payment.status === 'PendingVerification'
                            ? 'warm-gray'
                            : 'red'
                        }
                      >
                        {detail.payment.isVerified
                          ? 'Payment Cleared & Verified'
                          : detail.payment.status === 'PendingVerification'
                          ? 'Pending Finance Verification'
                          : 'Payment Pending'}
                      </Tag>
                    </div>
                  </div>
                )}

                {/* Workspace Ergonomic Tabs */}
                <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: '1.25rem', gap: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('copilot')}
                    style={{
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      background: workspaceTab === 'copilot' ? '#fff' : 'transparent',
                      borderBottom: workspaceTab === 'copilot' ? '3px solid #0f62fe' : '3px solid transparent',
                      color: workspaceTab === 'copilot' ? '#0f62fe' : '#525252',
                      fontWeight: workspaceTab === 'copilot' ? 700 : 500,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '-2px'
                    }}
                  >
                    <Security size={16} />
                    <span>Statutory Advisor</span>
                    {agentDraft && (() => {
                      const isEligible = agentDraft.eligibility?.isEligible ?? true;
                      const hasDocDeficiencies = !isEligible || (agentDraft.eligibility?.missingDocuments?.length ?? 0) > 0 || (agentDraft.eligibility?.matchPercentage ?? 100) < 70;
                      const rawRisk = agentDraft.validation?.riskLevel?.toLowerCase() ?? '';
                      const isHigh = rawRisk.includes('high') || rawRisk.includes('critical');
                      const isMedium = !isHigh && (rawRisk.includes('medium') || hasDocDeficiencies || agentDraft.validation?.isValid === false);

                      return (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: isHigh ? '#ffd7d9' : isMedium ? '#fed2aa' : '#defbe6',
                          color: isHigh ? '#da1e28' : isMedium ? '#bc4a04' : '#0e6027',
                          fontWeight: 700
                        }}>
                          {isHigh ? 'High Risk' : isMedium ? 'Medium' : 'Low'}
                        </span>
                      );
                    })()}
                  </button>

                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('application')}
                    style={{
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      background: workspaceTab === 'application' ? '#fff' : 'transparent',
                      borderBottom: workspaceTab === 'application' ? '3px solid #0f62fe' : '3px solid transparent',
                      color: workspaceTab === 'application' ? '#0f62fe' : '#525252',
                      fontWeight: workspaceTab === 'application' ? 700 : 500,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '-2px'
                    }}
                  >
                    <Document size={16} />
                    <span>Application Form Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('decision')}
                    style={{
                      padding: '0.75rem 1.25rem',
                      border: 'none',
                      background: workspaceTab === 'decision' ? '#fff' : 'transparent',
                      borderBottom: workspaceTab === 'decision' ? '3px solid #0f62fe' : '3px solid transparent',
                      color: workspaceTab === 'decision' ? '#0f62fe' : '#525252',
                      fontWeight: workspaceTab === 'decision' ? 700 : 500,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '-2px'
                    }}
                  >
                    <Task size={16} />
                    <span>Official Determination</span>
                    {decision && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        background: decision === 'Approved' ? '#defbe6' : (decision === 'Rejected' ? '#ffd7d9' : '#fddc69'),
                        color: '#161616',
                        fontWeight: 700
                      }}>
                        {decision}
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab 1: Agent 4 AI Copilot & Audit (Prominently displayed at top) */}
                {workspaceTab === 'copilot' && (
                  <div style={{ animation: "fadeIn 0.2s ease-in" }}>
                    <AgentDraftPanel
                      draft={agentDraft}
                      loading={agentLoading}
                      error={agentError}
                      answers={detail?.answers ?? {}}
                      serviceName={detail?.task.serviceName ?? undefined}
                      currentStage={detail?.task.currentStage ?? 1}
                      maxStages={detail?.task.maxStages ?? 1}
                      departmentName={detail?.task.department ?? 'Government Department'}
                      citizenName={detail?.task.citizenName ?? undefined}
                      citizenNic={detail?.task.citizenNic ?? undefined}
                      paymentAmount={detail?.payment?.amount}
                      onRegenerate={regenerateAgentDraft}
                      onApplyDecisionOrder={(decType, text) => {
                        setDecision(decType);
                        setComments(text);
                        setWorkspaceTab('decision');
                      }}
                    />
                  </div>
                )}

                {/* Tab 2: Citizen's submitted form answers */}
                {workspaceTab === 'application' && (
                  <div style={{ backgroundColor: '#fff', padding: '1.25rem', border: '1px solid #e0e0e0', marginBottom: '1.5rem', animation: "fadeIn 0.2s ease-in" }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Submitted Form Fields & Data</h3>
                    {detail && Object.keys(detail.answers).length > 0 ? (
                      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(10rem, 35%) 1fr', gap: '0.75rem 1rem', fontSize: '0.875rem' }}>
                        {Object.entries(detail.answers).map(([label, value]) => (
                          <div key={label} style={{ display: 'contents' }}>
                            <dt style={{ color: '#525252', padding: '0.25rem 0', borderBottom: '1px solid #f4f4f4' }}>{label}</dt>
                            <dd style={{ fontWeight: 500, wordBreak: 'break-word', padding: '0.25rem 0', borderBottom: '1px solid #f4f4f4' }}>{value || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p style={{ fontSize: '0.875rem', color: '#525252' }}>
                        {detail ? "No form answers were submitted with this application." : "Loading…"}
                      </p>
                    )}
                  </div>
                )}

                {/* Tab 3: Decision Panel */}
                {workspaceTab === 'decision' && (
                  detail?.task.status && detail.task.status !== "Pending" ? (
                    <div style={{ backgroundColor: '#fff', padding: '1.5rem', border: '1px solid #e0e0e0', marginBottom: '1.5rem', animation: "fadeIn 0.2s ease-in" }}>
                      <div style={{
                        padding: '1.25rem 1.5rem',
                        backgroundColor: detail.task.status === 'Approved' ? '#f6fbf7' : (detail.task.status === 'Rejected' ? '#fff8f8' : '#fcfaf0'),
                        border: `1px solid ${detail.task.status === 'Approved' ? '#a7f0ba' : (detail.task.status === 'Rejected' ? '#ffb3b8' : '#fddc69')}`,
                        borderRadius: '4px',
                        marginBottom: '1.25rem',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          {detail.task.status === 'Approved' ? (
                            <CheckmarkFilled size={28} color="#198038" />
                          ) : detail.task.status === 'Rejected' ? (
                            <Close size={28} color="#da1e28" />
                          ) : (
                            <Warning size={28} color="#b28600" />
                          )}
                          <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#161616', margin: 0 }}>
                              Official Determination: {detail.task.status}
                            </h3>
                            <p style={{ fontSize: '0.875rem', color: '#525252', marginTop: '2px' }}>
                              {detail.task.status === 'Approved'
                                ? ((detail.task.maxStages ?? 1) > ((detail.task.stageNumber && detail.task.stageNumber > 0) ? detail.task.stageNumber : (detail.task.currentStage ?? 1))
                                    ? `Stage ${(detail.task.stageNumber && detail.task.stageNumber > 0) ? detail.task.stageNumber : (detail.task.currentStage ?? 1)} milestone verified and approved. Citizen progress unlocked for next stage.`
                                    : "Final Statutory Decree verified and approved. All workflow stages complete.")
                                : detail.task.status === 'Rejected'
                                  ? "Application rejected by department officer for statutory defect."
                                  : "Application returned to citizen for statutory revisions and document resubmission."}
                            </p>
                          </div>
                        </div>

                        <div style={{
                          backgroundColor: '#fff',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          padding: '0.875rem 1rem',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '0.5rem 1rem',
                          fontSize: '0.8125rem',
                          marginTop: '0.75rem',
                        }}>
                          <div><span style={{ color: '#525252' }}>Application:</span> <strong>{detail.task.referenceNumber || `APP-${detail.task.applicationId}`}</strong></div>
                          <div><span style={{ color: '#525252' }}>Department:</span> <strong>{detail.task.department || 'Government Department'}</strong></div>
                          <div><span style={{ color: '#525252' }}>Citizen:</span> <strong>{detail.task.citizenName || 'Citizen'}</strong></div>
                          <div><span style={{ color: '#525252' }}>Statutory Payment:</span> <strong>{detail.payment?.isVerified ? `Verified (LKR ${detail.payment.amount})` : 'Exempt / Not Required'}</strong></div>
                          {comments && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#525252' }}>Recorded Finding:</span> <em>"{comments}"</em></div>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Button
                          kind="primary"
                          renderIcon={ChevronLeft}
                          onClick={() => navigate('/officer/pending-reviews')}
                        >
                          Return to Pending Reviews Queue
                        </Button>
                        <Button
                          kind="secondary"
                          renderIcon={Document}
                          onClick={handleExportPdf}
                        >
                          Export Audit Dossier (PDF)
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#fff', padding: '1.5rem', border: '1px solid #e0e0e0', marginBottom: '1.5rem', animation: "fadeIn 0.2s ease-in" }}>
                     <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Record Determination</h3>
                     
                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                        <Button 
                           kind={decision === "Approved" ? "primary" : "tertiary"} 
                           size="md"
                           renderIcon={Checkmark} 
                           onClick={() => handleDecision("Approved")}
                           disabled={isSubmitting || (Boolean(detail?.payment?.hasPayment) && !detail?.payment?.isVerified)}
                           style={{ flex: '1 1 auto', minWidth: '160px', justifyContent: 'center' }}
                        >
                           {(detail?.task.maxStages ?? 1) > ((detail?.task.stageNumber && detail.task.stageNumber > 0) ? detail.task.stageNumber : (detail?.task.currentStage ?? 1))
                             ? `Approve Stage ${(detail?.task.stageNumber && detail.task.stageNumber > 0) ? detail.task.stageNumber : (detail?.task.currentStage ?? 1)} & Advance`
                             : "Approve Official Decree"}
                        </Button>
                        <Button 
                           kind={decision === "Revision Requested" ? "primary" : "tertiary"} 
                           size="md"
                           renderIcon={Warning} 
                           onClick={() => handleDecision("Revision Requested")}
                           disabled={isSubmitting}
                           style={{ flex: '1 1 auto', minWidth: '150px', justifyContent: 'center' }}
                        >
                           Request Revision
                        </Button>
                        <Button 
                           kind={decision === "Rejected" ? "danger" : "danger--tertiary"} 
                           size="md"
                           renderIcon={Close} 
                           onClick={() => handleDecision("Rejected")}
                           disabled={isSubmitting}
                           style={{ flex: '1 1 auto', minWidth: '100px', justifyContent: 'center' }}
                        >
                           Reject
                        </Button>
                     </div>

                     {Boolean(detail?.payment?.hasPayment) && !detail?.payment?.isVerified && (
                       <div
                         style={{
                           marginBottom: '1.5rem',
                           padding: '0.625rem 0.875rem',
                           backgroundColor: '#fff8f8',
                           border: '1px solid #ffb3b8',
                           borderRadius: 4,
                           display: 'flex',
                           alignItems: 'center',
                           gap: '0.5rem',
                           fontSize: '0.8125rem',
                           color: '#da1e28',
                         }}
                       >
                         <Warning size={16} />
                         <span>
                           <strong>Stage Approval Locked:</strong> Statutory fee of LKR {detail?.payment?.amount?.toLocaleString()} must be audited and verified by the Department Finance Officer before this stage can be approved.
                         </span>
                       </div>
                     )}

                     {(decision === "Rejected" || decision === "Revision Requested") && (
                       <div style={{ animation: "fadeIn 0.2s ease-in" }}>
                           <Select 
                              id="reason-code" 
                              labelText="Reason Code" 
                              value={reasonId} 
                              onChange={(e) => setReasonId(e.target.value)}
                              style={{ marginBottom: '1rem' }}
                           >
                              <SelectItem value="" text="Choose an option" />
                              {rejectionReasons.map(r => (
                                <SelectItem key={r.id} value={r.id.toString()} text={`${r.code}: ${r.description}`} />
                              ))}
                           </Select>

                          <TextArea 
                             id="workspace-rejection-comments"
                             labelText="Additional Comments & Statutory Findings (Visible to Citizen)" 
                             placeholder="Explain exactly what needs to be fixed or cite legal defect..."
                             value={comments}
                             onChange={(e) => setComments(e.target.value)}
                             rows={6}
                             style={{ marginBottom: '1rem' }}
                             maxCount={5000}
                             enableCounter
                          />

                          <Button 
                             renderIcon={ArrowRight} 
                             onClick={() => submitDecision(decision)}
                             disabled={isSubmitting}
                          >
                             Submit {decision}
                          </Button>
                       </div>
                     )}

                     {submitStatus === "success" && (
                       <InlineNotification kind="success" title="Success" subtitle="Decision recorded. Returning to queue..." hideCloseButton style={{ marginTop: '1rem' }} />
                     )}
                     {submitStatus === "error" && (
                       <InlineNotification kind="error" title="Error" subtitle="Failed to save decision. Try again." hideCloseButton style={{ marginTop: '1rem' }} />
                     )}
                  </div>
                  )
                )}

                {/* Docked Quick Action Bar: Only shown on Copilot and Application tabs (hidden on Official Determination to prevent duplicate buttons) */}
                {workspaceTab !== 'decision' && (
                  <div style={{
                    padding: '0.875rem 1rem',
                    backgroundColor: '#f4f4f4',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    marginBottom: '1.5rem'
                  }}>
                    <div style={{ fontSize: '0.8125rem', color: '#525252' }}>
                      <strong>Action:</strong> {detail?.task.status && detail.task.status !== "Pending" ? `Official Determination: ${detail.task.status}` : (decision ? `Selected: ${decision}` : 'Review above and record determination')}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {detail?.task.status && detail.task.status !== "Pending" ? (
                        <>
                          <Button
                            kind="primary"
                            size="sm"
                            onClick={() => setWorkspaceTab("decision")}
                          >
                            View Determination
                          </Button>
                          <Button
                            kind="ghost"
                            size="sm"
                            renderIcon={ChevronLeft}
                            onClick={() => navigate('/officer/pending-reviews')}
                          >
                            Back to Queue
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            kind={decision === "Approved" ? "primary" : "tertiary"}
                            size="sm"
                            renderIcon={Checkmark}
                            onClick={() => { handleDecision("Approved"); }}
                            disabled={isSubmitting || (detail?.payment != null && !detail.payment.isVerified)}
                          >
                            {isSubmitting && decision === "Approved" ? "Approving..." : "Approve"}
                          </Button>
                          <Button
                            kind={decision === "Revision Requested" ? "primary" : "tertiary"}
                            size="sm"
                            renderIcon={Warning}
                            onClick={() => { handleDecision("Revision Requested"); }}
                            disabled={isSubmitting}
                          >
                            Request Revision
                          </Button>
                          <Button
                            kind={decision === "Rejected" ? "danger" : "danger--tertiary"}
                            size="sm"
                            renderIcon={Close}
                            onClick={() => { handleDecision("Rejected"); }}
                            disabled={isSubmitting}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Column>
            </Grid>


            <SupervisorCopilotBubble
              applicationId={detail?.task.applicationId}
              serviceName={detail?.task.serviceName ?? "Government Service"}
              currentStage={detail?.task.currentStage ?? 1}
              maxStages={detail?.task.maxStages ?? 1}
              citizenName={detail?.task.citizenName ?? ""}
              citizenNic={detail?.task.citizenNic ?? ""}
              departmentName={detail?.task.department ?? "Government Department"}
            />
          </main>
    </>
  );
}


