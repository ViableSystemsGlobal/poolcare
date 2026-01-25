"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Search, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/theme-context";

interface SupplyRequest {
  id: string;
  carerId: string;
  items: Array<{
    name: string;
    quantity: number;
    unit?: string;
    notes?: string;
  }>;
  priority: string;
  status: string;
  notes?: string;
  requestedAt: string;
  approvedAt?: string;
  fulfilledAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  carer: {
    id: string;
    name?: string;
    user?: {
      name?: string;
      phone?: string;
      email?: string;
    };
  };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  normal: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

export default function SuppliesPage() {
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "fulfill" | "reject">("approve");
  const [rejectionReason, setRejectionReason] = useState("");
  const { getThemeClasses } = useTheme();
  const theme = getThemeClasses();

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const response = await fetch(
        `http://localhost:4000/api/supplies/requests?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRequests(data.items || []);
      }
    } catch (error) {
      console.error("Failed to fetch supply requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (request: SupplyRequest, action: "approve" | "fulfill" | "reject") => {
    setSelectedRequest(request);
    setActionType(action);
    setRejectionReason("");
    setActionDialogOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedRequest) return;

    try {
      const token = localStorage.getItem("token");
      const body: any = {
        status: actionType === "approve" ? "approved" : actionType === "fulfill" ? "fulfilled" : "rejected",
      };

      if (actionType === "reject" && rejectionReason) {
        body.rejectionReason = rejectionReason;
      }

      const response = await fetch(
        `http://localhost:4000/api/supplies/requests/${selectedRequest.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (response.ok) {
        setActionDialogOpen(false);
        fetchRequests();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to update request");
      }
    } catch (error) {
      console.error("Failed to update request:", error);
      alert("Failed to update request");
    }
  };

  const filteredRequests = requests.filter((request) => {
    const matchesSearch =
      request.carer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.carer?.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.items.some((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "approved":
        return <CheckCircle className="h-4 w-4" />;
      case "fulfilled":
        return <CheckCircle className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Supply Requests</h1>
          <p className="text-gray-500">Manage supply requests from carers</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Requests</CardTitle>
              <CardDescription>View and manage supply requests</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="fulfilled">Fulfilled</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No supply requests found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {request.carer?.name || request.carer?.user?.name || "Unknown"}
                        </div>
                        {request.carer?.user?.phone && (
                          <div className="text-sm text-gray-500">{request.carer.user.phone}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {request.items.map((item, idx) => (
                          <div key={idx} className="text-sm">
                            {item.name} - {item.quantity} {item.unit || "units"}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={priorityColors[request.priority] || priorityColors.normal}>
                        {request.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[request.status] || statusColors.pending}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(request.status)}
                          {request.status}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(request.requestedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {request.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(request, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(request, "reject")}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {request.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(request, "fulfill")}
                          >
                            Fulfill
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve"
                ? "Approve Supply Request"
                : actionType === "fulfill"
                ? "Fulfill Supply Request"
                : "Reject Supply Request"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "reject" && (
                <div className="mt-4 space-y-2">
                  <Label>Rejection Reason</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                  />
                </div>
              )}
              {actionType !== "reject" && (
                <p>
                  Are you sure you want to {actionType} this supply request from{" "}
                  {selectedRequest?.carer?.name || selectedRequest?.carer?.user?.name}?
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmAction}
              disabled={actionType === "reject" && !rejectionReason}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

