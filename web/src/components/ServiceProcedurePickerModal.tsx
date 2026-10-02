import React, { useState, useMemo } from "react";
import {
  Modal,
  Search,
  Select,
  SelectItem,
  Tag,
  Button,
  Pagination,
} from "@carbon/react";
import { Checkmark, Launch } from "@carbon/icons-react";
import { SERVICE_CATEGORIES } from "../constants/departments";

export interface ServicePickerItem {
  id: number | string;
  serviceId: string;
  name: string;
  category?: string;
  status?: string;
  totalStages?: number;
}

interface ServiceProcedurePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: ServicePickerItem[];
  selectedServiceId: string | number;
  onSelectService: (service: ServicePickerItem) => void;
  title?: string;
}

export const ServiceProcedurePickerModal: React.FC<ServiceProcedurePickerModalProps> = ({
  isOpen,
  onClose,
  services,
  selectedServiceId,
  onSelectService,
  title = "Browse & Select Service Procedure",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const filteredServices = useMemo(() => {
    return services.filter((srv) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        srv.serviceId?.toLowerCase().includes(q) ||
        srv.name?.toLowerCase().includes(q) ||
        (srv.category && srv.category.toLowerCase().includes(q));

      const matchesCategory =
        categoryFilter === "All" || srv.category === categoryFilter;

      const matchesStatus =
        statusFilter === "All" || srv.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [services, searchQuery, categoryFilter, statusFilter]);

  const pagedServices = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredServices.slice(start, start + pageSize);
  }, [filteredServices, page, pageSize]);

  const handleSelect = (service: ServicePickerItem) => {
    onSelectService(service);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onRequestClose={onClose}
      modalHeading={title}
      passiveModal
      size="lg"
      aria-label="Service Procedure Browser Modal"
    >
      <div style={{ padding: "0 0 1rem 0" }}>
        <p style={{ color: "#525252", fontSize: "0.875rem", marginBottom: "1rem" }}>
          Filter and select from all available service procedures in the government catalog.
        </p>

        {/* Filter Controls Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Search
            id="picker-search"
            labelText="Search procedures"
            placeholder="Search by code (e.g., GSN-TRN) or service name..."
            size="md"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            onClear={() => setSearchQuery("")}
          />

          <Select
            id="picker-cat-filter"
            labelText="Category"
            size="md"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <SelectItem value="All" text={`All Categories (${services.length})`} />
            {SERVICE_CATEGORIES.map((cat) => (
              <SelectItem
                key={cat}
                value={cat}
                text={`${cat} (${services.filter((s) => s.category === cat).length})`}
              />
            ))}
          </Select>

          <Select
            id="picker-status-filter"
            labelText="Status"
            size="md"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <SelectItem value="All" text="All Statuses" />
            <SelectItem value="Active" text="Active" />
            <SelectItem value="Draft" text="Draft" />
            <SelectItem value="Retired" text="Retired" />
          </Select>
        </div>

        {/* Results Count & Reset */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem 0",
            fontSize: "0.8125rem",
            color: "#6f6f6f",
            borderBottom: "1px solid #e0e0e0",
            marginBottom: "0.75rem",
          }}
        >
          <span>
            Found <strong>{filteredServices.length}</strong> matching procedures
            {categoryFilter !== "All" ? ` in ${categoryFilter}` : ""}
          </span>
          {(searchQuery || categoryFilter !== "All" || statusFilter !== "All") && (
            <Button
              kind="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("All");
                setStatusFilter("All");
                setPage(1);
              }}
              style={{ padding: "0.25rem 0.5rem", minHeight: "auto" }}
            >
              Reset Filters
            </Button>
          )}
        </div>

        {/* Services Table List */}
        <div
          style={{
            maxHeight: "420px",
            overflowY: "auto",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
          }}
        >
          {filteredServices.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "#6f6f6f" }}>
              <p style={{ fontWeight: 600, fontSize: "1rem" }}>No service procedures found</p>
              <p style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                Try adjusting your search keyword or category filter.
              </p>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f4f4f4", borderBottom: "1px solid #e0e0e0" }}>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Service ID</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Procedure Name</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Category</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Stages</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0.75rem 1rem", fontWeight: 600, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedServices.map((srv) => {
                  const isCurrent =
                    srv.id.toString() === selectedServiceId?.toString();
                  return (
                    <tr
                      key={srv.id}
                      style={{
                        borderBottom: "1px solid #e0e0e0",
                        backgroundColor: isCurrent ? "#edf5ff" : "#ffffff",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = "#f9f9f9";
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = "#ffffff";
                      }}
                    >
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <Tag type={isCurrent ? "blue" : "cool-gray"} size="sm">
                          {srv.serviceId}
                        </Tag>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#161616" }}>
                        {srv.name}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap", color: "#525252" }}>
                        {srv.category || "General"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap", color: "#525252" }}>
                        {srv.totalStages ? `${srv.totalStages} Stages` : "1 Stage"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <Tag
                          type={
                            srv.status === "Active"
                              ? "green"
                              : srv.status === "Draft"
                              ? "warm-gray"
                              : "red"
                          }
                          size="sm"
                        >
                          {srv.status || "Active"}
                        </Tag>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        {isCurrent ? (
                          <Tag type="blue" size="sm" renderIcon={Checkmark}>
                            Selected
                          </Tag>
                        ) : (
                          <Button
                            size="sm"
                            kind="tertiary"
                            renderIcon={Launch}
                            onClick={() => handleSelect(srv)}
                            style={{ minHeight: "32px", padding: "0 0.75rem" }}
                          >
                            Select
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {filteredServices.length > pageSize && (
          <div style={{ marginTop: "0.5rem" }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              pageSizes={[8, 16, 32, 50]}
              totalItems={filteredServices.length}
              onChange={({ page: newPage, pageSize: newPageSize }) => {
                setPage(newPage);
                setPageSize(newPageSize);
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
