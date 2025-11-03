"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";

export default function PlansPageSimple() {
  const [plans] = useState<any[]>([]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Plans</h1>
          <p className="text-gray-600 mt-1">Manage recurring maintenance schedules</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Plan
        </Button>
      </div>

      {/* Simple Card */}
      <Card>
        <CardHeader>
          <CardTitle>Service Plans ({plans.length})</CardTitle>
          <CardDescription>Recurring maintenance schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No service plans found</h3>
              <p className="text-gray-600 mb-4">Get started by creating your first service plan</p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Plan
              </Button>
            </div>
          ) : (
            <div>Plans will appear here</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
