# PoolCare UI Standard

## List Pages Layout Pattern

All list pages (Jobs, Clients, Pools, Service Plans, etc.) follow this standard layout:

### 1. Header Section
- Page title and description
- Primary action button (e.g., "New Job", "Create Client")

### 2. AI Recommendation + Metrics Layout (2/3 + 1/3 Grid)
- **Left (2/3)**: `DashboardAICard` with horizontal layout (3 recommendations per row, max 3)
- **Right (1/3)**: 2x2 grid of metric cards

### 3. Main Content Card
- Card header with title and description
- **Bulk Actions Bar** (appears when items are selected):
  - Shows count of selected items
  - Bulk action buttons (Export, Delete, etc.)
  - Clear selection button
- **Filters/Search** section
- **Table** with:
  - Checkbox column (first column)
  - Select all checkbox in header
  - Clickable rows (navigate to detail pages)
  - Actions column (last column)

## Table Requirements

### Required Features
1. **Checkbox Selection**
   - First column contains checkboxes
   - Header checkbox for "select all"
   - Individual row checkboxes
   - Selection state managed in `Set<string>` (item IDs)

2. **Clickable Rows**
   - Rows are clickable and navigate to detail page: `/resource/:id`
   - Click handlers should stop propagation for:
     - Checkboxes
     - Buttons
     - Links
   - Hover state: `hover:bg-gray-50`
   - Cursor: `cursor-pointer`

3. **Bulk Actions**
   - Appears when `selectedItems.size > 0`
   - Common actions:
     - **Export**: Download selected items as CSV
     - **Delete**: Delete selected items with confirmation
     - **Clear**: Clear selection
   - Page-specific actions (e.g., "Assign" for Jobs)

### Implementation Pattern

```typescript
// State
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

// Select all
const handleSelectAll = (checked: boolean) => {
  setSelectedItems(checked ? new Set(items.map(i => i.id)) : new Set());
};

// Select individual
const handleSelectItem = (id: string, checked: boolean) => {
  const newSelected = new Set(selectedItems);
  checked ? newSelected.add(id) : newSelected.delete(id);
  setSelectedItems(newSelected);
};

// Row click handler
const handleRowClick = (id: string, event: React.MouseEvent) => {
  const target = event.target as HTMLElement;
  if (target.closest('button') || target.closest('input[type="checkbox"]') || target.closest('a')) {
    return; // Don't navigate
  }
  router.push(`/resource/${id}`);
};

// Table structure
<TableHeader>
  <TableRow>
    <TableHead className="w-12">
      <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
    </TableHead>
    {/* Other columns */}
  </TableRow>
</TableHeader>
<TableBody>
  {items.map((item) => (
    <TableRow
      key={item.id}
      className="cursor-pointer hover:bg-gray-50"
      onClick={(e) => handleRowClick(item.id, e)}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selectedItems.has(item.id)}
          onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
        />
      </TableCell>
      {/* Other cells */}
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        {/* Action buttons */}
      </TableCell>
    </TableRow>
  ))}
</TableBody>
```

### Bulk Actions Bar

```tsx
{selectedItems.size > 0 && (
  <div className="flex items-center justify-between p-4 mb-4 bg-orange-50 border border-orange-200 rounded-lg">
    <span>{selectedItems.size} item(s) selected</span>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={handleBulkExport}>Export</Button>
      <Button size="sm" variant="destructive" onClick={handleBulkDelete}>Delete</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelectedItems(new Set())}>Clear</Button>
    </div>
  </div>
)}
```

## Dashboard AI Card Layouts

- **Dashboard page**: Vertical layout (1 per row), max 5 recommendations
- **List pages**: Horizontal layout (3 per row), max 3 recommendations

## Export Format

CSV exports should include:
- Header row with column names
- Data rows with quoted values
- Filename: `{resource}-{date}.csv`

```typescript
const csv = [
  ["Column1", "Column2", "Column3"],
  ...items.map(item => [item.field1, item.field2, item.field3])
]
  .map(row => row.map(cell => `"${cell}"`).join(","))
  .join("\n");
```
