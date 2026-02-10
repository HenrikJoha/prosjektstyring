# Prosjektstyring - Complete Application Summary

## Overview
Prosjektstyring is a project management application designed for construction/contractor companies to manage workers, projects, and assignments in a Gantt-style calendar view. The app provides financial tracking, worker management, and visual project scheduling.

---

## Core Features

### 1. **Calendar/Gantt View (Kalender)**
The main view showing workers and their project assignments in a timeline format.

#### Visual Features:
- **Gantt Chart Layout**: Horizontal timeline with workers as rows and dates as columns
- **Week-based Display**: Shows 12 weeks at a time with navigation arrows
- **Week Numbers**: Displays week numbers with date ranges in the header
- **Month Separators**: Clear visual separation between months with month names
- **Weekend Exclusion**: Weekends are excluded from the calendar (only working days shown)
- **Week Separators**: Visual lines separating each week
- **Norwegian Holidays**: Automatically highlights Norwegian holidays in red
- **Overlapping Bars**: When multiple projects overlap on the same worker:
  - Bars stack vertically underneath each other
  - Row height dynamically adjusts (50% larger)
  - Bars become proportionally smaller (25% smaller) to fit
  - Only applies when overlaps exist; returns to normal when no overlaps

#### Project Assignment Bars:
- **Color-coded**: Each project has a unique color
- **Project Name Display**: Shows project name inside the bar
- **Interactive**:
  - **Desktop**: Double-click to edit project details
  - **Mobile**: Double-tap to edit project details
  - **Drag to Move**: Click and drag to change assignment dates
  - **Resize**: Drag left/right edges to extend or shorten duration
  - **Resize Handles**: 16px wide handles (extend 4px outside bar) for easier grabbing
  - **Mobile Drag**: Hold for 500ms, then drag (prevents accidental scrolling)

#### Creating Assignments:
- **Drag Selection**: Click and drag across calendar cells to select date range
- **Project Selection Modal**: Opens automatically after selection
- **Quick Assignment**: Can assign to existing project or create new one
- **Auto-assignment**: If dragging on a project leader's row, they're auto-assigned as project leader

---

### 2. **Worker Management (Arbeidere)**
Tab for managing workers and their roles.

#### Worker Types:
- **Prosjektleder** (Project Leader): Can manage projects and workers
- **Tømrer** (Carpenter): Assigned to a project leader

#### Features:
- **Add Workers**: Create new workers with name and role
- **Edit Workers**: Modify worker details
- **Delete Workers**: Remove workers from the system
- **Hierarchical Display**: Tømrers are grouped under their project leader
- **Project Leader Assignment**: Tømrers can be assigned to a project leader

---

### 3. **Finance View (Økonomi)**
Financial overview and project financial management.

#### Top Summary:
- **Ordrereserve**: Total remaining amount across all active projects (sum of all project ordrereserve values)

#### Project List:
- **Grouped by Project Leader**: Projects are visually grouped by their assigned project leader
- **Unassigned Section**: Projects without a project leader shown at bottom with easy assignment option
- **Active Projects Table** with columns:
  - **Prosjektleder**: Shows assigned project leader (clickable to change)
  - **Prosjektnavn**: Project name (clickable to open edit modal)
  - **Beløp**: Total project amount (NOK)
  - **A konto %**: Percentage invoiced (only for "Tilbud" type)
  - **Fakturert**: Invoiced amount (manual for "Timer og materiell", calculated for "Tilbud")
  - **Ordrereserve**: Remaining amount (Beløp - Fakturert or Beløp - (Beløp × A konto %))
  - **Fremdrift** (Progress): 
    - Percentage: (actual working days / planned working days) × 100
    - Visual progress bar with color coding
    - Excludes weekends from calculations
    - Considers all workers assigned to the project

#### Project Types (Prosjekttype):
1. **Tilbud** (Quote/Estimate):
   - A konto % is editable (0-100%)
   - Fakturert = Beløp × (A konto % / 100)
   - Ordrereserve = Beløp - Fakturert

2. **Timer og materiell** (Hours and Materials):
   - A konto % shows "-" (not applicable)
   - Fakturert is manually editable
   - Ordrereserve = Beløp - Fakturert
   - Auto-adjustment: If Fakturert > Beløp, automatically sets Beløp = Fakturert and Ordrereserve = 0

#### Financial Editing:
- **Inline Editing**: Click any cell to edit (amount, A konto %, fakturert)
- **Enter to Save**: Press Enter to save and move to next field
- **Auto-select**: Clicking a field with "0" clears it automatically
- **Create Projects**: Can create new projects directly from Finance tab
- **Edit Projects**: Click project name to open full edit modal

---

### 4. **Project Types**

#### Regular Projects:
- Standard projects with budget, description, color
- Can be edited, deleted (with confirmation)
- Appear in Finance tab
- Counted in Ordrereserve calculations

#### Special System Projects:

**Sykemeldt (Sick Leave)** - Red color:
- Sub-options: "Egenmelding", "Sykemelding"
- No budget impact (amount: 0)
- Non-deletable (isSystem: true)
- Excluded from Finance tab
- Can remove individual assignments but not the project itself

**Ferie (Holidays/Vacation)** - Yellow/Amber color:
- Sub-options: "Ferie", "Permisjon", "Pappaperm"
- No budget impact (amount: 0)
- Non-deletable (isSystem: true)
- Excluded from Finance tab
- Can remove individual assignments but not the project itself

---

### 5. **Project Management**

#### Creating Projects:
- **From Calendar**: Drag to select dates, then create project
- **From Finance Tab**: Create project before assigning to workers
- **Project Details**:
  - Name (required)
  - Description (optional)
  - Color (16 predefined colors)
  - Amount (NOK)
  - Prosjekttype (Tilbud or Timer og materiell)
  - Project Leader assignment

#### Editing Projects:
- **Double-click** any project bar in calendar to edit
- **Edit Modal** allows changing:
  - Name
  - Description
  - Color
  - Amount
  - Prosjekttype (billing type)
  - Project Leader
- **System Projects**: Can only view info, cannot edit details

#### Deleting Projects:
- **Delete project** is only available on the **Økonomi** (Finance) page (trash icon per project).
- **Kalender**: Double-clicking a bar only offers **"Fjern fra kalender"** (remove assignment from calendar). This applies to every bar, including the last one for that project—the project is not deleted from the calendar view.
- **System Projects**: Cannot be deleted; only assignments can be removed from the calendar.

---

### 6. **Assignment Management**

#### Creating Assignments:
- Drag across calendar cells to select date range
- Choose existing project or create new one
- Multiple workers can be assigned to the same project
- Auto-assigns project leader based on worker row

#### Modifying Assignments:
- **Move**: Click and drag the entire bar to change dates
- **Resize**: Drag left/right edges to change duration
- **Remove**: Double-click bar → "Fjern fra kalender" button
- **Mobile**: Hold 500ms before dragging to prevent accidental scrolling

#### Overlapping Assignments:
- Automatically stacks vertically
- Dynamic row height adjustment
- Proportional bar sizing

---

### 7. **User Interface**

#### Navigation:
- **Sidebar** (Desktop): Left-side navigation with tabs
- **Bottom Navigation** (Mobile): Fixed bottom bar with tabs
- **Tabs**:
  1. Kalender (Calendar/Gantt view)
  2. Arbeidere (Workers)
  3. Økonomi (Finance)

#### Header:
- Shows current tab name
- Displays total "Ordrereserve" across all active projects
- Responsive design

#### Responsive Design:
- **Desktop**: Full sidebar, larger touch targets
- **Mobile**: 
  - Bottom navigation bar
  - Larger resize handles (24px on touch devices)
  - 500ms hold delay for dragging
  - Optimized touch interactions

---

### 8. **Data Persistence**

#### Database (Supabase):
- **Tables**:
  - `workers`: Worker information and roles
  - `projects`: Project details, financials, types
  - `project_assignments`: Worker-project-date assignments
- **Real-time Sync**: All changes saved immediately to Supabase
- **Row-Level Security (RLS)**: Enabled for data protection

#### Data Loading:
- Automatic data loading on app start
- Loading states during data fetch
- Error handling for failed operations

---

### 9. **Financial Calculations**

#### Ordrereserve Calculation:
- **For "Tilbud" projects**: Beløp - (Beløp × A konto % / 100)
- **For "Timer og materiell" projects**: Beløp - Fakturert
- **Total**: Sum of all active regular projects' ordrereserve values
- **Exclusions**: System projects (sick leave, vacation) excluded

#### Progress Calculation:
- **Formula**: (Total actual working days / Total planned working days) × 100
- **Actual Days**: Sum of all working days (excluding weekends) across all assignments for the project
- **Planned Days**: Sum of all planned working days (excluding weekends) for all assignments
- **Visual**: Progress bar with color coding (green/yellow/red based on percentage)

---

### 10. **Technical Features**

#### Framework & Stack:
- **Next.js 14** (App Router)
- **TypeScript**
- **React**
- **Tailwind CSS** (responsive styling)
- **Zustand** (state management)
- **Supabase** (database & backend)
- **date-fns** (date manipulation with Norwegian locale)
- **Vercel** (hosting)

#### Key Technical Implementations:
- **Custom Drag & Drop**: Implemented for Gantt interactions
- **Touch Event Handling**: Separate logic for mobile vs desktop
- **React Portals**: Used for modals and dropdowns
- **Dynamic Layout**: Overlapping bar stacking algorithm
- **Date Calculations**: Working days, holidays, week numbers
- **Responsive Design**: Mobile-first approach with breakpoints

---

## User Workflows

### Creating a New Project Assignment:
1. Go to "Kalender" tab
2. Click and drag across calendar cells for a worker
3. Select existing project or create new one
4. If creating: Fill in name, color, amount, type
5. Assignment appears as colored bar on calendar

### Editing Project Details:
1. Double-click any project bar in calendar
2. Edit modal opens with all project details
3. Modify name, description, color, amount, type
4. Save changes

### Managing Finances:
1. Go to "Økonomi" tab
2. View total Ordrereserve at top
3. See all projects grouped by project leader
4. Click any cell to edit financial values inline
5. Press Enter to save and move to next field
6. View progress percentage for each project

### Adding Sick Leave or Vacation:
1. Go to "Kalender" tab
2. Drag to select dates for a worker
3. In project selection modal, choose from:
   - Sykemeldt section (Egenmelding or Sykemelding)
   - Fravær/Permisjon section (Ferie, Permisjon, or Pappaperm)
4. Assignment appears with appropriate color (red for sick, yellow for vacation)

---

## Data Model

### Worker:
- id, name, role (prosjektleder | tømrer), projectLeaderId (optional)

### Project:
- id, name, description, color, amount, aKontoPercent, fakturert, billingType, status, projectType, isSystem, projectLeaderId, createdAt

### ProjectAssignment:
- id, projectId, workerId, startDate, endDate

---

## Mobile Optimizations

- Larger touch targets for resize handles
- 500ms hold delay before dragging (prevents accidental scrolling)
- Bottom navigation bar (doesn't block content)
- Responsive calendar layout
- Touch-optimized interactions
- Scroll prevention during active drag

---

## Future Considerations

The app was designed with authentication in mind but currently runs without login. The infrastructure exists for:
- Admin users (full access)
- Project leader users (access only to their projects)
- Role-based data filtering
- User authentication via Supabase Auth

---

This application provides a comprehensive solution for managing construction projects, workers, and finances with an intuitive Gantt-style interface optimized for both desktop and mobile use.
