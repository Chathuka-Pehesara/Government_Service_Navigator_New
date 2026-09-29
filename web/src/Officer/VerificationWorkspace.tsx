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
  Toggle,
  Modal
} from "@carbon/react";
import { Checkmark, Close, Document, ChevronLeft, ArrowRight, Warning, Money, TrashCan, Launch } from "@carbon/icons-react";
import AgentDraftPanel from "./AgentDraftPanel";
import DocumentPreview from "./DocumentPreview";
import { getAgentDraft, generateAgentDraft, type AgentDraftView } from "./agentDraftApi";
import { ApiError } from "../utils/api";
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
    currentStage?: number;
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
}

interface GalleryDocument {
  key: string;
  name: string;
  fieldLabel?: string;
  file?: UploadedDocument;
  aiTag: string;
}

export default function VerificationWorkspace() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [decision, setDecision] = useState<string>("");
  const [comments, setComments] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("Not required for review");
  const [deleteNotes, setDeleteNotes] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [rejectionReasons, setRejectionReasons] = useState<{id: number, code: string, description: string}[]>([]);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [agentDraft, setAgentDraft] = useState<AgentDraftView | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentError, setAgentError] = useState("");

  // Document Gallery State: files the citizen uploaded, plus documents the agents flagged as missing
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [verifiedDocKeys, setVerifiedDocKeys] = useState<Set<string>>(new Set());

  const documents = useMemo<GalleryDocument[]>(() => {
    const uploaded = detail?.documents ?? [];
    // Older applications have no stored files, only the names the agent saw
    const attached: GalleryDocument[] = uploaded.length > 0
      ? uploaded.map(d => ({ key: d.id, name: d.fileName, fieldLabel: d.fieldLabel, file: d, aiTag: "Submitted by citizen" }))
      : (agentDraft?.action.draft?.attachedDocumentNames ?? []).map(name => ({ key: `name:${name}`, name, aiTag: "Submitted by citizen" }));
    const missing = (agentDraft?.eligibility.missingDocuments ?? [])
      .map(name => ({ key: `missing:${name}`, name, aiTag: "Missing (flagged by agent)" }));
    return [...attached, ...missing];
  }, [detail, agentDraft]);

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
        const response = await fetch(`http://localhost:5119/api/Verification/tasks/${taskId}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
        if (response.ok) {
          setDetail(await response.json());
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
        const response = await fetch(`http://localhost:5119/api/Verification/rejection-reasons`, {
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
    if (status === "Approved" && detail?.payment && !detail.payment.isVerified) {
      alert("Cannot complete stage as verified: Statutory payment has not been verified by the Department Finance Officer.");
      return;
    }
    setDecision(status);
    if (status === "Approved") {
      await submitDecision(status);
    }
  };

  const submitDecision = async (status: string) => {
    if (status === "Approved" && detail?.payment && !detail.payment.isVerified) {
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
    const isMultiStage = (detail?.task.maxStages ?? 1) > (detail?.task.currentStage ?? 1);

    try {
      const endpoint = (status === "Approved" && isMultiStage)
        ? `http://localhost:5119/api/Verification/tasks/${taskId}/approve-stage`
        : `http://localhost:5119/api/Verification/tasks/${taskId}/decision`;

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

  const handleDeleteApplication = async () => {
    if (!taskId) return;
    setIsDeleting(true);
    const token = localStorage.getItem("officerToken");
    const fullReason = deleteNotes.trim() ? `${deleteReason}: ${deleteNotes.trim()}` : deleteReason;
    try {
      const response = await fetch(`http://localhost:5119/api/Verification/tasks/${taskId}?reason=${encodeURIComponent(fullReason)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (response.ok) {
        setSubmitStatus("success");
        setTimeout(() => navigate('/officer/pending-reviews'), 1200);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.message || "Failed to delete application.");
      }
    } catch (e) {
      console.error("Delete failed", e);
      alert("An error occurred while deleting the application.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Header aria-label="Registry Portal System">
            <HeaderName href="#" prefix="GSN">
              Workspace
            </HeaderName>
            <HeaderGlobalBar style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingRight: '0.5rem' }}>
               <Button
                 kind="danger--ghost"
                 size="sm"
                 renderIcon={TrashCan}
                 onClick={() => setDeleteModalOpen(true)}
                 style={{ whiteSpace: 'nowrap' }}
               >
                 <span className="hidden sm:inline">Delete Application</span>
                 <span className="sm:hidden">Delete</span>
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
                    <p style={{ fontSize: '0.875rem', color: '#525252' }}>Manually review and verify each uploaded proof.</p>
                  </div>
                  {currentDoc && (
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
                     <Tag type={currentDoc.aiTag.includes("Missing") ? "red" : "blue"}>
                        {currentDoc.aiTag}
                     </Tag>
                     {currentDocVerified && (
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
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 300 }}>Application Review</h2>
                  {detail?.task.maxStages && detail.task.maxStages > 1 && (
                    <Tag type="teal">
                      Stage {detail.task.currentStage ?? 1} of {detail.task.maxStages}
                    </Tag>
                  )}
                </div>
                <div style={{ marginBottom: '2rem' }}>
                  <p style={{ fontSize: '0.875rem', color: '#525252' }}>App ID: <strong>{detail?.task.referenceNumber ?? "—"}</strong></p>
                  <p style={{ fontSize: '0.875rem', color: '#525252' }}>Citizen: <strong>{detail?.task.citizenName || "—"}</strong>{detail?.task.citizenNic ? ` (${detail.task.citizenNic})` : ""}</p>
                  <p style={{ fontSize: '0.875rem', color: '#525252' }}>Service: <strong>{detail?.task.serviceName || "—"}</strong></p>
                  {detail?.submittedAt && (
                    <p style={{ fontSize: '0.875rem', color: '#525252' }}>Submitted: <strong>{new Date(detail.submittedAt).toLocaleString()}</strong></p>
                  )}
                </div>

                {detailError && (
                  <InlineNotification kind="error" title="Error" subtitle={detailError} hideCloseButton lowContrast style={{ marginBottom: '1rem' }} />
                )}

                {/* Statutory Payment Status Banner (Synchronized with Finance Officer Audit) */}
                {detail?.payment && (
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
                      marginBottom: '1.5rem',
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
                      {detail.payment.slipUrl && (
                        <Button
                          size="sm"
                          kind="tertiary"
                          renderIcon={Launch}
                          href={detail.payment.slipUrl}
                          target="_blank"
                        >
                          View Deposit Slip
                        </Button>
                      )}
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

                {/* Citizen's submitted form answers */}
                <div style={{ backgroundColor: '#fff', padding: '1rem', border: '1px solid #e0e0e0', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Submitted Application</h3>
                  {detail && Object.keys(detail.answers).length > 0 ? (
                    <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(8rem, 40%) 1fr', gap: '0.5rem 1rem', fontSize: '0.875rem' }}>
                      {Object.entries(detail.answers).map(([label, value]) => (
                        <div key={label} style={{ display: 'contents' }}>
                          <dt style={{ color: '#525252' }}>{label}</dt>
                          <dd style={{ fontWeight: 500, wordBreak: 'break-word' }}>{value || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: '#525252' }}>
                      {detail ? "No form answers were submitted with this application." : "Loading…"}
                    </p>
                  )}
                </div>

                {/* Agent Reasoning Trail: Agent 2 eligibility + Agent 3 draft (fee, appointment, pre-filled fields) */}
                <AgentDraftPanel
                  draft={agentDraft}
                  loading={agentLoading}
                  error={agentError}
                  answers={detail?.answers ?? {}}
                  onRegenerate={regenerateAgentDraft}
                />

                {/* Decision Panel */}
                <div style={{ backgroundColor: '#fff', padding: '1.5rem', border: '1px solid #e0e0e0' }}>
                   <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Record Decision</h3>
                   
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <Button 
                         kind={decision === "Approved" ? "primary" : "tertiary"} 
                         size="md"
                         renderIcon={Checkmark} 
                         onClick={() => handleDecision("Approved")}
                         disabled={isSubmitting || (detail?.payment != null && !detail.payment.isVerified)}
                         style={{ flex: '1 1 auto', minWidth: '160px', justifyContent: 'center' }}
                      >
                         {(detail?.task.maxStages ?? 1) > (detail?.task.currentStage ?? 1)
                           ? `Approve Stage ${detail?.task.currentStage ?? 1} & Advance`
                           : "Approve"}
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

                   {detail?.payment != null && !detail.payment.isVerified && (
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
                         <strong>Stage Approval Locked:</strong> Statutory fee of LKR {detail.payment.amount?.toLocaleString()} must be audited and verified by the Department Finance Officer before this stage can be approved.
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
                           labelText="Additional Comments (Visible to Citizen)" 
                           placeholder="Explain exactly what needs to be fixed..."
                           value={comments}
                           onChange={(e) => setComments(e.target.value)}
                           rows={4}
                           style={{ marginBottom: '1rem' }}
                           maxCount={2000}
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

                   <div style={{ marginTop: '2rem', paddingTop: '1.25rem', borderTop: '1px solid #e0e0e0' }}>
                     <p style={{ fontSize: '0.8rem', color: '#525252', marginBottom: '0.75rem' }}>
                       Application does not need review? (e.g. duplicate, invalid, or test submission):
                     </p>
                     <Button
                       kind="danger--tertiary"
                       size="sm"
                       renderIcon={TrashCan}
                       onClick={() => setDeleteModalOpen(true)}
                       disabled={isSubmitting || isDeleting}
                       style={{ width: '100%' }}
                     >
                       Delete Application (Audit Logged)
                     </Button>
                   </div>
                </div>
              </Column>
            </Grid>

            {/* Delete Confirmation Modal */}
            <Modal
              open={deleteModalOpen}
              modalHeading="Delete Verification Application"
              primaryButtonText={isDeleting ? "Deleting..." : "Delete Application"}
              secondaryButtonText="Cancel"
              danger
              onRequestClose={() => setDeleteModalOpen(false)}
              onRequestSubmit={handleDeleteApplication}
              primaryButtonDisabled={isDeleting}
            >
              <p style={{ marginBottom: '1rem', color: '#525252' }}>
                Are you sure you want to delete application <strong>{detail?.task.referenceNumber}</strong> ({detail?.task.citizenName || detail?.task.citizenNic})?
                This application will be removed from the verification queue and marked as deleted. An official audit entry will record that you deleted it.
              </p>
              <Select
                id="workspace-delete-reason-select"
                labelText="Reason for Deletion (Recorded in Audit Section)"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                style={{ marginBottom: '1rem' }}
              >
                <SelectItem value="Not required for review" text="Not required for review" />
                <SelectItem value="Duplicate application submitted" text="Duplicate application submitted" />
                <SelectItem value="Invalid or test application" text="Invalid or test application" />
                <SelectItem value="Citizen requested cancellation" text="Citizen requested cancellation" />
                <SelectItem value="Other (specified in notes)" text="Other (specified in notes)" />
              </Select>
              <TextArea
                id="workspace-delete-notes"
                labelText="Officer Remarks / Justification (Logged to Audit Trail)"
                placeholder="Explain why this application does not need review..."
                rows={3}
                value={deleteNotes}
                onChange={(e) => setDeleteNotes(e.target.value)}
                maxCount={1000}
                enableCounter
              />
            </Modal>
          </main>
    </>
  );
}


