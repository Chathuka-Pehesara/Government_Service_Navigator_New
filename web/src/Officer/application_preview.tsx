import { useState, useEffect } from "react";
import {
  Header,
  HeaderName,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  Button,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  Checkbox,
  FileUploader
} from "@carbon/react";
import { Dashboard, Document, Time, User, Logout, ArrowLeft,
  CheckmarkOutline,
  DataStructured
} from '@carbon/icons-react';
import type { FormField } from "./Application_create/TemplateBuilder";
import { API_BASE_URL } from "../utils/api";

interface TemplateField extends FormField {
  orderIndex?: number;
}

interface Template {
  formName: string;
  subTitle?: string;
  lawText?: string;
  fields?: TemplateField[];
}

function getTemplateIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("id");
}

export default function ApplicationPreview() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(() => !!getTemplateIdFromUrl());
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);

  const fetchTemplateData = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/templates/${id}`);
      if (response.ok) {
        const data = await response.json();
        setTemplate(data);
      }
    } catch (error) {
      console.error("Error fetching template", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = getTemplateIdFromUrl();
    if (id) {
      const load = async () => {
        await fetchTemplateData(id);
      };
      load();
    }
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem("officerToken");
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
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
      window.location.href = "/officer/login";
    }
  };

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'heading':
        return <h3 key={field.id} style={{ marginTop: '2rem', marginBottom: '1rem', color: '#161616' }}>{field.label}</h3>;
      case 'paragraph':
        return <p key={field.id} style={{ marginBottom: '1.5rem', color: '#525252' }}>{field.label}</p>;
      case 'text':
      case 'number':
      case 'date':
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem' }}>
            <TextInput
              id={field.id}
              labelText={field.label}
              type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
              required={field.required}
            />
          </div>
        );
      case 'textarea':
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem' }}>
            <TextArea
              id={field.id}
              labelText={field.label}
              required={field.required}
              rows={4}
            />
          </div>
        );
      case 'select':
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem' }}>
            <Select id={field.id} labelText={field.label} required={field.required}>
              <SelectItem disabled hidden value="" text="Choose an option" />
              {(field.options?.split(',') || []).map((opt: string, i: number) => (
                <SelectItem key={i} value={opt.trim()} text={opt.trim()} />
              ))}
            </Select>
          </div>
        );
      case 'multiselect':
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem' }}>
            <fieldset style={{ border: 'none', padding: 0 }}>
              <legend style={{ fontSize: '0.875rem', color: '#525252', marginBottom: '0.5rem' }}>{field.label}</legend>
              {(field.options?.split(',') || []).map((opt: string, i: number) => (
                <Checkbox key={i} id={`${field.id}-${i}`} labelText={opt.trim()} />
              ))}
            </fieldset>
          </div>
        );
      case 'file':
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: '#525252', marginBottom: '0.5rem' }}>{field.label} {field.required && '*'}</p>
            <FileUploader
              buttonLabel="Add file"
              buttonKind="primary"
              size="md"
              filenameStatus="edit"
              accept={['.jpg', '.png', '.pdf']}
              multiple={true}
            />
          </div>
        );
      case 'table': {
        const cols = field.options?.split(',').map(c => c.trim()) || ['Column 1'];
        return (
          <div key={field.id} style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
            <p style={{ fontSize: '0.875rem', color: '#525252', marginBottom: '0.5rem' }}>{field.label} {field.required && '*'}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e0e0e0' }}>
              <thead>
                <tr>
                  {cols.map((col, i) => (
                    <th key={i} style={{ backgroundColor: '#f4f4f4', padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {cols.map((_, i) => (
                    <td key={i} style={{ padding: '0.5rem', borderBottom: '1px solid #e0e0e0' }}>
                      <TextInput id={`${field.id}-row0-col${i}`} labelText="" placeholder="Enter value..." />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <Button kind="ghost" size="sm" style={{ marginTop: '0.5rem' }}>+ Add Row</Button>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <>
      <Header aria-label="Government Service Navigator">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
          onClick={() => setIsSideNavExpanded((prev) => !prev)}
          isActive={isSideNavExpanded}
          isCollapsible
        />
        <HeaderName href="#" prefix="Gov">
          Service Navigator
        </HeaderName>
        <SideNav aria-label="Side navigation" expanded={isSideNavExpanded}>
          <SideNavItems>
            <SideNavLink renderIcon={Dashboard} href="/officer/dashboard">Application Queue</SideNavLink>
                            <SideNavLink renderIcon={CheckmarkOutline} href="/officer/bulk-verification">
                  Bulk Verification
                </SideNavLink>
                <SideNavLink renderIcon={DataStructured} href="/officer/rejection-codes">
                  Rejection Codes
                </SideNavLink>
            <SideNavLink renderIcon={Document} href="/officer/verified-records">Verified Records</SideNavLink>
            <SideNavLink renderIcon={Time} href="/officer/pending-reviews">Pending Reviews</SideNavLink>
            <SideNavLink renderIcon={User} href="/officer/profile">My Profile</SideNavLink>
            <div style={{ marginTop: 'auto', borderTop: '1px solid #393939' }}>
              <SideNavLink renderIcon={Logout} onClick={handleLogout} style={{ cursor: 'pointer' }}>Sign Out</SideNavLink>
            </div>
          </SideNavItems>
        </SideNav>
      </Header>

      <main className="mt-12 min-h-screen p-4 sm:p-6 min-[66rem]:p-8 ml-0 min-[66rem]:ml-64" style={{ backgroundColor: '#f4f4f4' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2rem' }}>
          <Button 
            kind="ghost" 
            renderIcon={ArrowLeft} 
            iconDescription="Back" 
            hasIconOnly 
            onClick={() => window.location.href = "/officer/applications"}
            style={{ marginRight: '1rem' }}
          />
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 400, color: '#161616' }}>Preview Application</h1>
            <p style={{ color: '#525252', marginTop: '0.5rem' }}>This is how citizens will see the application form.</p>
          </div>
        </div>

        {loading ? (
          <p>Loading preview...</p>
        ) : !template ? (
          <p>Template not found.</p>
        ) : (
          <div className="p-6 sm:p-8 min-[66rem]:p-12" style={{ backgroundColor: '#ffffff', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '2px solid #0f62fe' }}>
              <h2 style={{ fontSize: '2.5rem', color: '#161616', marginBottom: '1rem' }}>{template.formName}</h2>
              {template.subTitle && <h3 style={{ fontSize: '1.25rem', color: '#525252', fontWeight: 400 }}>{template.subTitle}</h3>}
              {template.lawText && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f4f4f4', borderLeft: '4px solid #0f62fe', textAlign: 'left', fontSize: '0.875rem' }}>
                  <strong>Legal Notice:</strong> {template.lawText}
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); alert('This is just a preview!'); }}>
              {[...(template.fields || [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)).map((field) => renderField(field))}

              <div className="flex-wrap gap-2" style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'flex-end' }}>
                <Button kind="secondary" style={{ marginRight: '1rem' }} onClick={() => window.location.href = "/officer/applications"}>
                  Close Preview
                </Button>
                <Button kind="primary" type="submit">
                  Submit Application
                </Button>
              </div>
            </form>
          </div>
        )}
      </main>
    </>
  );
}

