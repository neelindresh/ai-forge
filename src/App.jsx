import React, { useCallback, useState, useRef, useEffect, useMemo, useContext } from 'react';
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals
} from 'reactflow';
import 'reactflow/dist/style.css';
import * as Icons from 'lucide-react';
import dagre from 'dagre';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// shadcn/ui — used only by the generated solution screens (Preview: input form + results)
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty as EmptyState, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ========================================================
// 1. DYNAMIC CUSTOM NODE
// ========================================================
const CustomAppNode = ({ data, selected }) => {
  const IconComponent = Icons[data.iconName] || Icons.Bot;

  return (
    <div className={`bg-white rounded-xl shadow-md border p-3 w-64 flex items-start cursor-pointer transition-shadow ${selected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}>
      {data.kind !== 'input_field' && (
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-purple-500" />
      )}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 shrink-0 mt-0.5 ${data.colorClass}`}>
        <IconComponent size={20} />
      </div>
      <div>
        <div className="font-bold text-gray-800 text-sm leading-tight mb-1">{data.title}</div>
        <div className="text-[10px] text-gray-500 leading-tight">{data.subtitle}</div>
        {data.fieldType && (
          <div className="mt-2 inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[9px] font-mono border border-gray-200">
            {data.fieldType}
          </div>
        )}
      </div>
      {data.kind !== 'output_component' && (
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-purple-500" />
      )}
    </div>
  );
};


// ========================================================
// 1b. SHARED CATALOGS (used by the toolbar AND the backend mapping)
// ========================================================
const INPUT_ITEMS = [
  { title: "Text Input", subtitle: "Collects short string data", iconName: "Type", colorClass: "bg-blue-50 text-blue-500", fieldType: "text" },
  { title: "Text Area", subtitle: "Collects long-form strings", iconName: "AlignLeft", colorClass: "bg-blue-50 text-blue-500", fieldType: "textarea" },
  { title: "Dropdown", subtitle: "Select from a list", iconName: "List", colorClass: "bg-blue-50 text-blue-500", fieldType: "dropdown" },
  { title: "File Upload", subtitle: "Upload documents", iconName: "Upload", colorClass: "bg-blue-50 text-blue-500", fieldType: "file_upload" },
];

const OUTPUT_ITEMS = [
  { title: "Markdown", subtitle: "Render formatted text", iconName: "FileText", colorClass: "bg-purple-50 text-purple-500", fieldType: "markdown" },
  { title: "Data Table", subtitle: "Render JSON arrays", iconName: "Table", colorClass: "bg-purple-50 text-purple-500", fieldType: "data_table" },
  { title: "Metric Cards", subtitle: "Render KPI numbers", iconName: "Activity", colorClass: "bg-purple-50 text-purple-500", fieldType: "metric_cards" },
  { title: "File Download", subtitle: "Provide downloadable artifacts", iconName: "DownloadCloud", colorClass: "bg-purple-50 text-purple-500", fieldType: "file_download" },
];

const ACTION_ITEMS = [
  { title: "Agent Step", subtitle: "Run an AI agent task", iconName: "Bot", colorClass: "bg-gray-100 text-gray-600", fieldType: "agent_action" },
  { title: "If / Else", subtitle: "Two-way conditional route", iconName: "GitBranch", colorClass: "bg-yellow-50 text-yellow-600", fieldType: "router_if_else" },
  { title: "Switch", subtitle: "Multi-path conditional route", iconName: "Network", colorClass: "bg-yellow-50 text-yellow-600", fieldType: "router_switch" },
  { title: "Merge", subtitle: "Combine parallel paths", iconName: "GitMerge", colorClass: "bg-yellow-50 text-yellow-600", fieldType: "router_merge" },
];

// Lookup by type, e.g. INPUT_BY_TYPE['file_upload'] -> { iconName: 'Upload', ... }
const INPUT_BY_TYPE = Object.fromEntries(INPUT_ITEMS.map((i) => [i.fieldType, i]));
const OUTPUT_BY_TYPE = Object.fromEntries(OUTPUT_ITEMS.map((i) => [i.fieldType, i]));

const ROUTER_ICONS = { merge: 'GitMerge', switch: 'Network', if_else: 'GitBranch' };

const EDGE_STYLE = { stroke: '#9ca3af', strokeWidth: 2 };
const FIELD_EDGE_STYLE = { stroke: '#60a5fa', strokeWidth: 2, strokeDasharray: '4 4' };
const COMPONENT_EDGE_STYLE = { stroke: '#a78bfa', strokeWidth: 2, strokeDasharray: '4 4' };

// ========================================================
// 2. LANDING PAGE
// ========================================================
const LandingPage = ({ onStart, isLoading }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onStart(inputValue);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#fdfcff] relative overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
        <div className="absolute top-40 -left-20 w-72 h-72 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-purple-200/40 to-transparent rounded-tr-full filter blur-2xl"></div>
      </div>

      <header className="h-20 flex items-center px-8 z-10">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Welcome to</div>
          <h1 className="text-xl font-bold text-gray-900 leading-none">AI Forge Solution</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center z-10 px-4 -mt-20">
        <div className="text-center mb-8 relative">
          <svg className="absolute -top-12 -right-16 w-32 h-16 text-purple-300 opacity-60" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,50 Q20,20 50,40 T90,10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
            <path d="M85,15 L95,5 L100,15 Z" fill="currentColor" />
          </svg>
          <h2 className="text-[40px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-purple-500 mb-3 tracking-tight">Let’s Build Your Solution</h2>
          <p className="text-gray-500 text-lg">Start by <span className="font-bold text-purple-700">describing</span> what you want</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-4xl relative">
          <div className="absolute -inset-1 bg-purple-300 rounded-xl blur-lg opacity-30"></div>
          <div className="relative bg-white rounded-xl border border-purple-100 shadow-sm flex items-center p-2 pl-6 h-16">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Describe your solution..."
              className="flex-1 bg-transparent border-none focus:outline-none text-gray-700 text-lg placeholder-gray-400 disabled:opacity-50"
              disabled={isLoading}
              autoFocus
            />
            <div className="flex items-center space-x-4 shrink-0 px-2">
              <button type="button" className="text-gray-400 hover:text-gray-600 transition"><Icons.Paperclip size={22} /></button>
              <button type="button" className="text-gray-400 hover:text-gray-600 transition"><Icons.Mic size={22} /></button>
              <div className="h-6 w-px bg-gray-200 mx-1"></div>
              <button type="submit" className="text-purple-600 hover:text-purple-800 transition disabled:opacity-50 flex items-center justify-center w-8" disabled={!inputValue.trim() || isLoading}>
                {isLoading ? <Icons.Loader2 size={24} className="animate-spin" /> : <Icons.Send size={24} className="transform translate-x-0.5" />}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

// ========================================================
// 3. DROPDOWN MENU (no full-screen overlay, so drops reach the canvas)
// ========================================================
const DropdownMenu = ({ title, icon: Icon, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click via a document listener instead of an overlay div.
  // An overlay would sit on top of the canvas and swallow the drop event.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const onDragStart = (event, item) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(item));
    event.dataTransfer.setData('text/plain', item.title); // Firefox/Safari need a plain type to start a drag
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition ${isOpen ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
      >
        <Icon className="w-4 h-4 mr-2 text-gray-500" />
        {title}
        <Icons.ChevronDown className="w-4 h-4 ml-2 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
          {items.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400 italic">Coming soon...</div>
          ) : (
            items.map((item, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                onDragEnd={() => setIsOpen(false)}
                className="px-4 py-3 hover:bg-blue-50 cursor-grab active:cursor-grabbing flex flex-col text-sm text-gray-700 border-l-2 border-transparent hover:border-blue-500 transition-colors select-none"
              >
                <div className="font-bold">{item.title}</div>
                <div className="text-[10px] text-gray-500">{item.subtitle}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ========================================================
// 3b. NODE DETAILS PANEL (data lineage between nodes)
// ========================================================

// What a node reads and produces, whatever kind of node it is
const getNodeIO = (node) => {
  const d = node?.data || {};
  const raw = d.raw || {};
  if (d.kind === 'input_field') return { inputs: [], outputs: raw.field_name ? [raw.field_name] : [] };
  if (d.kind === 'output_component') return { inputs: raw.data_source ? [raw.data_source] : [], outputs: [] };
  return { inputs: raw.inputs || [], outputs: raw.outputs || [] };
};

// Data a node hands to the next node. Routers with no outputs pass their inputs through.
const passedOn = (node) => {
  const { inputs, outputs } = getNodeIO(node);
  return node.data?.stepType === 'router' && outputs.length === 0 ? inputs : outputs;
};

// Data a node accepts from the previous node. Input steps accept the fields they expose.
const acceptedBy = (node) => {
  const { inputs, outputs } = getNodeIO(node);
  if (node.data?.stepType === 'input') return outputs;
  return inputs;
};

const linkData = (source, target) => {
  const accepted = new Set(acceptedBy(target));
  return passedOn(source).filter((x) => accepted.has(x));
};

const isStepNode = (n) => !['input_field', 'output_component'].includes(n.data?.kind);

const kindLabel = (n) => {
  const d = n.data || {};
  if (d.kind === 'input_field') return 'Input field';
  if (d.kind === 'output_component') return 'Output component';
  return { input: 'Input step', output: 'Output step', router: 'Router', agent_action: 'Agent step' }[d.stepType] || 'Step';
};

const DataTag = ({ name }) => (
  <span className="inline-block max-w-full truncate align-middle px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-[11px] font-mono text-gray-700">
    {name}
  </span>
);

const NodeChip = ({ node, onSelect, muted }) => {
  const Icon = Icons[node.data.iconName] || Icons.Bot;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      title={`Go to ${node.data.title}`}
      className={`inline-flex items-center max-w-full gap-1.5 pl-1 pr-2 py-1 rounded-md border text-xs text-left transition hover:border-purple-400 hover:bg-purple-50 ${muted ? 'border-dashed border-gray-300 text-gray-500' : 'border-gray-200 text-gray-800 bg-white'
        }`}
    >
      <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${node.data.colorClass}`}>
        <Icon size={12} />
      </span>
      <span className="truncate font-medium">{node.data.title}</span>
    </button>
  );
};

const PanelSection = ({ title, count, children }) => (
  <section className="px-5 py-4 border-b border-gray-100">
    <h4 className="text-xs font-semibold text-gray-500 mb-3">
      {title}{typeof count === 'number' && <span className="ml-1 text-gray-400 font-normal">({count})</span>}
    </h4>
    {children}
  </section>
);

const Empty = ({ children }) => <p className="text-xs text-gray-400">{children}</p>;

const DetailRow = ({ label, children }) => (
  <div className="flex gap-3 py-1.5 text-xs">
    <dt className="w-24 shrink-0 text-gray-500">{label}</dt>
    <dd className="min-w-0 text-gray-800 break-words">{children}</dd>
  </div>
);

const NodeDetailsPanel = ({ node, nodes, edges, editing, focusRoute, onToggleEdit, onPatch, onRename, onAddOutput, onQuickAdd, onSelect, onClose }) => {
  const [instructionOpen, setInstructionOpen] = useState(false);
  useEffect(() => setInstructionOpen(false), [node.id]);

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const d = node.data;
  const raw = d.raw || {};
  const { inputs, outputs } = getNodeIO(node);

  const incoming = edges.filter((e) => e.target === node.id).map((e) => byId[e.source]).filter(Boolean);
  const outgoing = edges.filter((e) => e.source === node.id).map((e) => byId[e.target]).filter(Boolean);
  const neighborIds = new Set([...incoming, ...outgoing].map((n) => n.id));

  const steps = nodes.filter((n) => isStepNode(n) && n.id !== node.id);

  // Who produces `name`: steps first, falling back to the input field that collects it
  const producersOf = (name) => {
    const fromSteps = steps.filter((n) => getNodeIO(n).outputs.includes(name));
    if (fromSteps.length) return fromSteps;
    return nodes.filter((n) => n.id !== node.id && n.data.kind === 'input_field' && n.data.raw?.field_name === name);
  };

  // Who uses `name`: steps that read it (or input steps that expose it, for input fields)
  const consumersOf = (name) =>
    steps.filter((n) => {
      if (getNodeIO(n).inputs.includes(name)) return true;
      return d.kind === 'input_field' && n.data.stepType === 'input' && getNodeIO(n).outputs.includes(name);
    });

  const displayedIn = (name) =>
    nodes.filter((n) => n.id !== node.id && n.data.kind === 'output_component' && n.data.raw?.data_source === name);

  const Icon = Icons[d.iconName] || Icons.Bot;

  const renderLinks = (list, direction) =>
    list.length === 0 ? (
      <Empty>{direction === 'in' ? 'Nothing connects into this node.' : 'This node does not connect to anything.'}</Empty>
    ) : (
      <ul className="space-y-3">
        {list.map((other) => {
          const shared = direction === 'in' ? linkData(other, node) : linkData(node, other);
          return (
            <li key={other.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
              <NodeChip node={other} onSelect={onSelect} />
              <div className="mt-2 text-xs text-gray-500 leading-relaxed">
                {shared.length > 0 ? (
                  <>
                    <span className="mr-1">{direction === 'in' ? 'Linked by' : 'Passes'}</span>
                    {shared.map((name, i) => (
                      <React.Fragment key={name}>
                        <DataTag name={name} />
                        {i < shared.length - 2 && <span>, </span>}
                        {i === shared.length - 2 && <span className="mx-1">and</span>}
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  <span>Control flow only. No shared data between these two.</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 w-full sm:w-[380px] bg-white border-l border-gray-200 shadow-xl z-30 flex flex-col"
      aria-label={`Details for ${d.title}`}
    >
      {/* Header */}
      <header className="flex items-start gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${d.colorClass}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-gray-500 mb-0.5">{kindLabel(node)}</div>
          <h3 className="font-bold text-gray-900 leading-snug break-words">{d.title}</h3>
          <div className="text-[11px] font-mono text-gray-400 mt-1 truncate">{node.id}</div>
        </div>
        <button
          onClick={onToggleEdit}
          className={`shrink-0 inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${editing ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
        >
          {editing ? <><Icons.Check size={14} className="mr-1" /> Done</> : <><Icons.Pencil size={14} className="mr-1" /> Edit</>}
        </button>
        <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Close details">
          <Icons.X size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isConditionalRouter(node) && (() => {
          const { upstream, other } = dataOptionsFor(nodes, edges, node.id);
          return (
            <PanelSection title="Routing">
              <RoutesEditor
                node={node}
                byId={byId}
                dataNames={union(raw.inputs, union(upstream, other))}
                focusKey={focusRoute?.nodeId === node.id ? focusRoute : null}
                onPatch={onPatch}
              />
            </PanelSection>
          );
        })()}

        {editing && (
          <PanelSection title="Edit node">
            <NodeEditor node={node} nodes={nodes} edges={edges} onPatch={onPatch} onRename={onRename} onAddOutput={onAddOutput} />
          </PanelSection>
        )}

        {/* Graph connections */}
        <PanelSection title="Previous nodes" count={incoming.length}>
          {renderLinks(incoming, 'in')}
        </PanelSection>

        <PanelSection title="Next nodes" count={outgoing.length}>
          {renderLinks(outgoing, 'out')}
        </PanelSection>

        {/* Data lineage */}
        {d.kind !== 'input_field' && (
          <PanelSection title={d.kind === 'output_component' ? 'Data shown' : 'Inputs'} count={inputs.length}>
            {inputs.length === 0 ? (
              <Empty>{d.stepType === 'input' ? 'Entry point. Values come from the input fields.' : 'This node does not read any data.'}</Empty>
            ) : (
              <ul className="space-y-3">
                {inputs.map((name) => {
                  const producers = producersOf(name);
                  return (
                    <li key={name}>
                      <DataTag name={name} />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {producers.length === 0 ? (
                          <span className="inline-flex items-center text-xs text-amber-700">
                            <Icons.AlertTriangle size={13} className="mr-1" /> Nothing on the canvas produces this.
                          </span>
                        ) : (
                          <>
                            <span className="text-xs text-gray-500">from</span>
                            {producers.map((p) => (
                              <NodeChip key={p.id} node={p} onSelect={onSelect} muted={!neighborIds.has(p.id)} />
                            ))}
                          </>
                        )}
                      </div>
                      {producers.some((p) => !neighborIds.has(p.id)) && (
                        <p className="mt-1 text-[11px] text-gray-400">Dashed: arrives from an earlier step, not a direct connection.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelSection>
        )}

        {d.kind !== 'output_component' && (
          <PanelSection title={d.kind === 'input_field' ? 'Value provided' : 'Outputs'} count={outputs.length}>
            {outputs.length === 0 ? (
              <Empty>{d.stepType === 'router' ? 'Routers pass their inputs straight through.' : 'This node does not produce data.'}</Empty>
            ) : (
              <ul className="space-y-3">
                {outputs.map((name) => {
                  const consumers = consumersOf(name);
                  const shown = displayedIn(name);
                  return (
                    <li key={name}>
                      <DataTag name={name} />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {consumers.length > 0 ? (
                          <>
                            <span className="text-xs text-gray-500">used by</span>
                            {consumers.map((c) => (
                              <NodeChip key={c.id} node={c} onSelect={onSelect} muted={!neighborIds.has(c.id)} />
                            ))}
                          </>
                        ) : (
                          shown.length === 0 && <span className="text-xs text-gray-400">Not used by any other node.</span>
                        )}
                      </div>
                      {shown.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-gray-500">shown in</span>
                          {shown.map((c) => <NodeChip key={c.id} node={c} onSelect={onSelect} muted={!neighborIds.has(c.id)} />)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PanelSection>
        )}

        {/* Node-specific details */}
        {!editing && <PanelSection title="Details">
          <dl>
            {d.kind === 'input_field' && (
              <>
                <DetailRow label="Label">{raw.label || '—'}</DetailRow>
                <DetailRow label="Field name"><DataTag name={raw.field_name} /></DetailRow>
                <DetailRow label="Type">{raw.field_type}</DetailRow>
                <DetailRow label="Required">{raw.required ? 'Yes' : 'No'}</DetailRow>
                {raw.placeholder && <DetailRow label="Placeholder">{raw.placeholder}</DetailRow>}
                {raw.options?.length > 0 && (
                  <DetailRow label="Options">
                    {raw.options.map((o) => (typeof o === 'object' ? o.label ?? o.value : o)).join(', ')}
                  </DetailRow>
                )}
              </>
            )}

            {d.kind === 'output_component' && (
              <>
                <DetailRow label="Type">{raw.component_type}</DetailRow>
                <DetailRow label="Data source">{raw.data_source ? <DataTag name={raw.data_source} /> : <span className="text-amber-700">Not set</span>}</DetailRow>
                <DetailRow label="Width">{raw.layout_span || 'full'}</DetailRow>
              </>
            )}

            {isStepNode(node) && (
              <>
                <DetailRow label="Step type">{d.stepType || d.kind || '—'}</DetailRow>
                {raw.router_type && <DetailRow label="Router">{raw.router_type}</DetailRow>}
                {raw.agent_id && <DetailRow label="Agent"><span className="font-mono">{raw.agent_id}</span></DetailRow>}
              </>
            )}
          </dl>

          {raw.task_instruction && (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1.5">Task instruction</div>
              <div className={`relative text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-lg p-3 ${instructionOpen ? '' : 'max-h-36 overflow-hidden'}`}>
                {raw.task_instruction}
                {!instructionOpen && <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-gray-50 to-transparent rounded-b-lg" />}
              </div>
              <button onClick={() => setInstructionOpen((o) => !o)} className="mt-1.5 text-xs font-medium text-purple-700 hover:text-purple-900">
                {instructionOpen ? 'Show less' : 'Show full instruction'}
              </button>
            </div>
          )}
        </PanelSection>}

        {/* Quick add */}
        {(() => {
          const { before, after } = quickAddOptions(node);
          if (!before.length && !after.length) return null;
          const btn = (item, dir) => {
            const I = Icons[item.iconName] || Icons.Plus;
            return (
              <button key={`${dir}-${item.fieldType}`} type="button" onClick={() => onQuickAdd(item, dir)}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-gray-200 bg-white text-xs text-gray-700 hover:border-purple-400 hover:bg-purple-50">
                <span className={`w-5 h-5 rounded flex items-center justify-center ${item.colorClass}`}><I size={12} /></span>
                {item.title}
              </button>
            );
          };
          return (
            <PanelSection title="Add connected node">
              {before.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] text-gray-400 mb-1.5">Input field feeding this step</div>
                  <div className="flex flex-wrap gap-1.5">{before.map((i) => btn(i, 'before'))}</div>
                </div>
              )}
              {after.length > 0 && (
                <div>
                  <div className="text-[11px] text-gray-400 mb-1.5">After this node</div>
                  <div className="flex flex-wrap gap-1.5">{after.map((i) => btn(i, 'after'))}</div>
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-3">You can also drag from a node’s right-hand dot to another node’s left-hand dot.</p>
            </PanelSection>
          );
        })()}
      </div>
    </aside>
  );
};

// ========================================================
// 3c-1. ROUTING (If / Else and Switch)
// ========================================================
// Backend shape stays: conditional_routes = { routeKey: targetStepId }.
// Extra fields on the router's raw data:
//   route_conditions: { [routeKey]: { mode: 'rules' | 'prompt', match: 'all' | 'any', rules: [...], prompt: '' } }
//   default_route:    routeKey taken when nothing matches ('else' for If / Else, 'default' for Switch)
//   rule:             { source: dataName, path: 'field', operator, value }
// Every route has its own handle on the router node (handle id = routeKey), so the
// branch you drag from decides the route. Routes can exist before they're connected (target null).

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'greater_than', label: 'is more than' },
  { value: 'greater_or_equal', label: 'is at least' },
  { value: 'less_than', label: 'is less than' },
  { value: 'less_or_equal', label: 'is at most' },
  { value: 'is_empty', label: 'is empty', unary: true },
  { value: 'is_not_empty', label: 'is not empty', unary: true },
  { value: 'is_true', label: 'is true', unary: true },
  { value: 'is_false', label: 'is false', unary: true },
];
const OPERATOR_BY_VALUE = Object.fromEntries(CONDITION_OPERATORS.map((o) => [o.value, o]));

const emptyRule = (source = '') => ({ source, path: '', operator: 'equals', value: '' });
const emptyCondition = (source = '') => ({ mode: 'rules', match: 'all', rules: [emptyRule(source)], prompt: '' });

const isRuleComplete = (r) =>
  !!r?.source && !!OPERATOR_BY_VALUE[r.operator] && (OPERATOR_BY_VALUE[r.operator].unary || String(r.value ?? '').trim() !== '');

const isConditionComplete = (c) =>
  !!c && (c.mode === 'prompt' ? !!c.prompt?.trim() : (c.rules || []).length > 0 && c.rules.every(isRuleComplete));

// Plain-language summary, e.g. `score is at least 70 and recommendation equals "shortlist"`
const describeRule = (r) => {
  const op = OPERATOR_BY_VALUE[r.operator];
  const subject = r.path || r.source;
  if (op.unary) return `${subject} ${op.label}`;
  const v = String(r.value).trim();
  return `${subject} ${op.label} ${v !== '' && !isNaN(Number(v)) ? v : `“${v}”`}`;
};

const describeCondition = (c) => {
  if (!c) return null;
  if (c.mode === 'prompt') return c.prompt?.trim() ? `“${c.prompt.trim()}”` : null;
  const done = (c.rules || []).filter(isRuleComplete);
  if (!done.length) return null;
  return done.map(describeRule).join(c.match === 'any' ? ' or ' : ' and ');
};

// 'if_else' | 'switch' | 'merge' | null
const routerKind = (node) => {
  if (node?.data?.stepType !== 'router') return null;
  const raw = node.data.raw || {};
  if (raw.router_type === 'if_else') return 'if_else';
  if (raw.router_type === 'merge') return 'merge';
  if (raw.router_type === 'switch' || Object.keys(raw.conditional_routes || {}).length) return 'switch';
  return 'merge';
};
const isConditionalRouter = (node) => ['if_else', 'switch'].includes(routerKind(node));

const defaultRouteKey = (node) =>
  node.data.raw?.default_route || (routerKind(node) === 'if_else' ? 'else' : 'default');

// The rows shown on a router node: condition routes first, the fallback route last
const getRouteRows = (node) => {
  const raw = node.data.raw || {};
  const kind = routerKind(node);
  const defKey = defaultRouteKey(node);
  const entries = Object.entries(raw.conditional_routes || {});
  let rows = entries.filter(([k]) => k !== defKey).map(([key, target]) => ({ key, target: target || null, isDefault: false }));
  if (kind === 'if_else' && rows.length === 0) rows = [{ key: 'if', target: null, isDefault: false }];
  rows.push({ key: defKey, target: raw.conditional_routes?.[defKey] || null, isDefault: true });
  return rows.map((r) => {
    const condition = r.isDefault ? null : raw.route_conditions?.[r.key];
    return { ...r, condition, summary: r.isDefault ? null : describeCondition(condition), complete: r.isDefault || isConditionComplete(condition) };
  });
};

// ---------- Backend route format ----------
// The backend sends conditional_routes as a list:
//   [{ condition_name, condition_instruction, next_step }, ...]
// (older responses used an object { name: stepId }). Both load into the internal shape:
//   conditional_routes { name: stepId }, route_conditions { name: condition }, default_route.
const routeKeyFrom = (name, i, taken) => {
  const base = String(name || '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || `route_${i + 1}`;
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  taken.add(key);
  return key;
};

const normalizeRouterStep = (step) => {
  const routes = step.conditional_routes;
  if (!Array.isArray(routes)) return step;

  const conditional_routes = {};
  const route_conditions = {};
  const taken = new Set();
  routes.forEach((r, i) => {
    const key = routeKeyFrom(r.condition_name, i, taken);
    conditional_routes[key] = r.next_step || null;
    const hasRules = Array.isArray(r.condition_rules) && r.condition_rules.length > 0;
    route_conditions[key] = hasRules
      ? { mode: 'rules', match: r.condition_match || 'all', rules: r.condition_rules, prompt: r.condition_instruction || '' }
      : { mode: 'prompt', match: 'all', rules: [emptyRule()], prompt: r.condition_instruction || '' };
  });

  // If / Else: the last route is the "else" (e.g. FULL_QA_PATH: "any other case")
  const keys = Object.keys(conditional_routes);
  const default_route = step.router_type === 'if_else' && keys.length >= 2
    ? keys[keys.length - 1]
    : step.default_route ?? null;

  return { ...step, conditional_routes, route_conditions, default_route };
};

// Internal route -> backend list entry
const routeToBackend = (key, target, condition, isDefault, kind) => {
  let instruction;
  if (isDefault) {
    instruction = condition?.prompt?.trim()
      || (kind === 'if_else' ? 'Choose this path when the condition above is not met.' : 'Choose this path when none of the other conditions match.');
  } else if (condition?.mode === 'prompt') {
    instruction = condition.prompt?.trim() || '';
  } else {
    const text = describeCondition(condition);
    instruction = text ? `Choose this path when ${text}.` : '';
  }
  const entry = { condition_name: key, condition_instruction: instruction, next_step: target };
  if (!isDefault && condition?.mode === 'rules') {
    entry.condition_rules = (condition.rules || []).filter(isRuleComplete);
    entry.condition_match = condition.match || 'all';
  }
  return entry;
};

const GENERIC_ROUTE_KEY = /^(if|else|default|case_\d+|route_\d+)$/;
const humanizeKey = (key) => {
  const t = String(key).replace(/_+/g, ' ').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const nextCaseKey = (raw) => {
  let i = Object.keys(raw.conditional_routes || {}).length;
  let key = `case_${i}`;
  while (key in (raw.conditional_routes || {}) || key === raw.default_route) key = `case_${++i}`;
  return key;
};

// Which route a new connection from `node` should use: the given handle, else the first unconnected route
const resolveRouteHandle = (node, handle) => {
  if (handle) return handle;
  const free = getRouteRows(node).find((r) => !r.target);
  return free ? free.key : null;
};

const routeBadge = (node, row, index) => {
  if (routerKind(node) === 'if_else') return row.isDefault ? 'Else' : 'If';
  return row.isDefault ? 'Otherwise' : `${index + 1}`;
};

// ---------- Router node (one handle per route) ----------
const RouterActionsContext = React.createContext(null);

const RouterNode = ({ id, data, selected }) => {
  const actions = useContext(RouterActionsContext);
  const updateNodeInternals = useUpdateNodeInternals();
  const node = { id, data };
  const kind = routerKind(node);
  const rows = getRouteRows(node);
  const rowKeys = rows.map((r) => r.key).join('|');

  // Handles move when routes are added, removed or reordered
  useEffect(() => { updateNodeInternals(id); }, [id, rowKeys, updateNodeInternals]);

  return (
    <div className={`bg-white rounded-xl shadow-md border w-72 cursor-pointer ${selected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300'}`}>
      <Handle type="target" position={Position.Left} style={{ top: 26 }}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white hover:!bg-purple-500" />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
          {kind === 'if_else' ? <Icons.GitBranch size={16} /> : <Icons.Network size={16} />}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-gray-800 text-sm leading-tight truncate">{data.title}</div>
          <div className="text-[10px] text-gray-500">
            {kind === 'if_else' ? 'If / Else' : 'Switch'}
          </div>
        </div>
      </div>

      {/* One row per route */}
      <div className="py-1">
        {rows.map((r, i) => {
          const badge = routeBadge(node, r, i);
          const needsCondition = !r.isDefault && !r.complete;
          return (
            <div key={r.key} className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); actions?.editRoute(id, r.key); }}
                title={r.isDefault ? 'Fallback route' : 'Edit this condition'}
                className="nodrag w-full text-left pl-3 pr-5 py-1.5 flex items-start gap-2 hover:bg-yellow-50/70 focus:outline-none focus-visible:bg-yellow-50"
              >
                <span className={`shrink-0 mt-px min-w-[34px] text-center px-1.5 py-0.5 rounded text-[10px] font-bold ${r.isDefault ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                  {badge}
                </span>
                <span className="min-w-0 flex-1">
                  {!GENERIC_ROUTE_KEY.test(r.key) && (
                    <span className="block text-[11px] font-semibold text-gray-800 leading-snug truncate">{humanizeKey(r.key)}</span>
                  )}
                  {r.isDefault ? (
                    <span className="block text-[11px] text-gray-500 leading-snug">
                      {kind === 'if_else' ? 'When the condition above is false' : 'When nothing above matches'}
                    </span>
                  ) : needsCondition ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 leading-snug">
                      <Icons.AlertCircle size={11} /> Set a condition
                    </span>
                  ) : (
                    <span className={`block text-[11px] leading-snug line-clamp-2 ${GENERIC_ROUTE_KEY.test(r.key) ? 'text-gray-800' : 'text-gray-500'}`}>{r.summary}</span>
                  )}
                  <span className={`block text-[10px] truncate ${r.target ? 'text-gray-400' : 'text-gray-400 italic'}`}>
                    {r.target ? `→ ${actions?.titleOf(r.target) || r.target}` : 'Drag from ● to connect'}
                  </span>
                </span>
              </button>
              <Handle
                type="source"
                id={r.key}
                position={Position.Right}
                className={`!w-3 !h-3 !border-2 !border-white hover:!bg-purple-500 ${r.target ? '!bg-yellow-500' : '!bg-gray-300'}`}
              />
            </div>
          );
        })}
      </div>

      {kind === 'switch' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); actions?.addCase(id); }}
          className="nodrag w-full flex items-center justify-center gap-1 border-t border-gray-100 py-1.5 text-[11px] font-medium text-purple-700 hover:bg-purple-50 rounded-b-xl"
        >
          <Icons.Plus size={12} /> Add case
        </button>
      )}
    </div>
  );
};

const nodeTypes = { custom: CustomAppNode, router: RouterNode };

// ========================================================
// 3c. GRAPH EDITING MODEL (pure helpers, no React)
// ========================================================
const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
const toDataName = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const newUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const ROUTER_FROM_ITEM = { router_if_else: 'if_else', router_switch: 'switch', router_merge: 'merge' };

// Recompute a node's title / subtitle / icon from its raw backend-shaped data
const withDisplay = (node) => {
  const d = node.data;
  const raw = d.raw || {};

  if (d.kind === 'input_field') {
    const meta = INPUT_BY_TYPE[raw.field_type] || INPUT_BY_TYPE.text;
    return {
      ...node, data: {
        ...d,
        title: raw.label || raw.field_name,
        subtitle: `${raw.field_name}${raw.required ? ' · required' : ''}`,
        iconName: meta.iconName, colorClass: meta.colorClass, fieldType: raw.field_type
      }
    };
  }

  if (d.kind === 'output_component') {
    const meta = OUTPUT_BY_TYPE[raw.component_type] || OUTPUT_BY_TYPE.markdown;
    return {
      ...node, data: {
        ...d,
        title: raw.component_title,
        subtitle: `Source: ${raw.data_source || 'not set'}${raw.layout_span ? ` · ${raw.layout_span} width` : ''}`,
        iconName: meta.iconName, colorClass: meta.colorClass, fieldType: raw.component_type
      }
    };
  }

  let iconName = 'Bot';
  let colorClass = 'bg-gray-100 text-gray-600';
  if (d.stepType === 'input') { iconName = 'GripHorizontal'; colorClass = 'bg-blue-50 text-blue-500'; }
  else if (d.stepType === 'output') { iconName = 'BarChart'; colorClass = 'bg-purple-50 text-purple-500'; }
  else if (d.stepType === 'router') { iconName = ROUTER_ICONS[raw.router_type] || 'GitBranch'; colorClass = 'bg-yellow-50 text-yellow-600'; }

  return {
    ...node, type: isConditionalRouter(node) ? 'router' : 'custom', data: {
      ...d,
      title: raw.step_name || d.title || 'Untitled step',
      subtitle: raw.agent_id
        ? `Agent: ${raw.agent_id}`
        : d.stepType === 'agent_action' ? 'No agent assigned' : 'System Node',
      iconName, colorClass, fieldType: undefined
    }
  };
};

const withRaw = (node, patch) => withDisplay({ ...node, data: { ...node.data, raw: { ...node.data.raw, ...patch } } });

// Build a brand-new node from a toolbar / quick-add catalog item
const createToolboxNode = (item, position) => {
  const uid = newUid();

  if (INPUT_BY_TYPE[item.fieldType]) {
    const id = `field_${item.fieldType}_${uid}`;
    return withDisplay({
      id, type: 'custom', position, data: {
        kind: 'input_field', raw: {
          field_id: id,
          field_name: `${item.fieldType}_${uid}`,
          label: item.title,
          field_type: item.fieldType,
          placeholder: null,
          required: false,
          options: item.fieldType === 'dropdown' ? ['Option 1', 'Option 2'] : null,
        }
      }
    });
  }

  if (OUTPUT_BY_TYPE[item.fieldType]) {
    const id = `component_${item.fieldType}_${uid}`;
    return withDisplay({
      id, type: 'custom', position, data: {
        kind: 'output_component', raw: {
          component_id: id,
          component_title: item.title,
          component_type: item.fieldType,
          data_source: '',
          layout_span: 'full',
        }
      }
    });
  }

  const isRouter = !!ROUTER_FROM_ITEM[item.fieldType];
  const id = `step_${uid}`;
  return withDisplay({
    id, type: 'custom', position, data: {
      kind: 'step',
      stepType: isRouter ? 'router' : 'agent_action',
      raw: {
        step_id: id,
        step_name: isRouter ? item.title : 'New agent step',
        step_type: isRouter ? 'router' : 'agent_action',
        router_type: isRouter ? ROUTER_FROM_ITEM[item.fieldType] : null,
        agent_id: null,
        task_instruction: '',
        inputs: [],
        outputs: [],
        next_steps: [],
        ...(ROUTER_FROM_ITEM[item.fieldType] === 'if_else' && {
          conditional_routes: { if: null, else: null },
          route_conditions: { if: emptyCondition() },
          default_route: 'else',
        }),
        ...(ROUTER_FROM_ITEM[item.fieldType] === 'switch' && {
          conditional_routes: { case_1: null, default: null },
          route_conditions: { case_1: emptyCondition() },
          default_route: 'default',
        }),
        ...(!['if_else', 'switch'].includes(ROUTER_FROM_ITEM[item.fieldType]) && { conditional_routes: null }),
      },
    }
  });
};

const makeEdge = (source, target, sourceHandle = null) => {
  const toComponent = target.data.kind === 'output_component';
  const fromField = source.data.kind === 'input_field';
  return {
    id: `e-${source.id}-${sourceHandle ? `${sourceHandle}-` : ''}${target.id}`,
    source: source.id,
    target: target.id,
    sourceHandle,
    animated: !toComponent && !fromField,
    style: fromField ? FIELD_EDGE_STYLE : toComponent ? COMPONENT_EDGE_STYLE : EDGE_STYLE,
  };
};

const reaches = (edges, fromId, toId) => {
  const seen = new Set();
  const stack = [fromId];
  while (stack.length) {
    const id = stack.pop();
    if (id === toId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.forEach((e) => e.source === id && stack.push(e.target));
  }
  return false;
};

// Returns a reason string when a connection isn't allowed, otherwise null
const connectionProblem = (nodes, edges, sourceId, targetId, sourceHandle = null) => {
  if (sourceId === targetId) return 'A node can’t connect to itself.';
  const S = nodes.find((n) => n.id === sourceId);
  const T = nodes.find((n) => n.id === targetId);
  if (!S || !T) return 'One of these nodes no longer exists.';
  if (T.data.kind === 'input_field') return 'Input fields start the flow, so nothing can connect into them.';
  if (S.data.kind === 'output_component') return 'Output components end the flow, so they can’t connect onward.';
  if (S.data.kind === 'input_field' && T.data.stepType !== 'input') return 'Connect input fields to the input step.';
  if (isConditionalRouter(S)) {
    if (!isStepNode(T)) return 'Routes lead to steps. Connect output components to the output step.';
    const handle = resolveRouteHandle(S, sourceHandle);
    if (!handle) return 'Every route is already connected. Drag from a route’s ● to change where it goes.';
    if (edges.some((e) => e.source === sourceId && e.target === targetId && e.sourceHandle === handle)) return 'This route already goes there.';
  } else if (edges.some((e) => e.source === sourceId && e.target === targetId)) {
    return 'These nodes are already connected.';
  }
  if (reaches(edges, targetId, sourceId)) return 'That connection would create a loop.';
  return null;
};

// Update the backend model when source -> target is connected
const applyConnection = (nodes, sourceId, targetId, sourceHandle = null) => {
  const source = nodes.find((n) => n.id === sourceId);
  const target = nodes.find((n) => n.id === targetId);
  if (!source || !target) return nodes;
  const data = passedOn(source);

  return nodes.map((n) => {
    // Source: record the route
    if (n.id === sourceId && isStepNode(n) && isStepNode(target)) {
      const raw = n.data.raw || {};
      if (isConditionalRouter(n)) {
        const key = resolveRouteHandle(n, sourceHandle);
        if (!key) return n;
        const isDefault = key === defaultRouteKey(n);
        const conditions = { ...(raw.route_conditions || {}) };
        if (!isDefault && !conditions[key]) conditions[key] = emptyCondition(raw.inputs?.[0] || '');
        return withRaw(n, {
          conditional_routes: { ...(raw.conditional_routes || {}), [key]: targetId },
          route_conditions: conditions,
          default_route: isDefault ? key : raw.default_route ?? null,
        });
      }
      return withRaw(n, { next_steps: union(raw.next_steps, [targetId]) });
    }

    // Target: receive the source's data
    if (n.id === targetId) {
      const raw = n.data.raw || {};
      if (n.data.kind === 'output_component') {
        return raw.data_source || !data.length ? n : withRaw(n, { data_source: data[0] });
      }
      if (n.data.stepType === 'input') {
        return source.data.kind === 'input_field' ? withRaw(n, { outputs: union(raw.outputs, data) }) : n;
      }
      if (isStepNode(n)) return withRaw(n, { inputs: union(raw.inputs, data) });
    }
    return n;
  });
};

// Remove the route source -> target from the model (data inputs are kept on purpose).
// Router routes keep their condition and simply become unconnected.
const unlink = (nodes, sourceId, targetId, sourceHandle = null) =>
  nodes.map((n) => {
    if (n.id !== sourceId || !isStepNode(n)) return n;
    const raw = n.data.raw || {};
    if (isConditionalRouter(n)) {
      const routes = Object.fromEntries(
        Object.entries(raw.conditional_routes || {}).map(([k, t]) =>
          [k, t === targetId && (!sourceHandle || sourceHandle === k) ? null : t])
      );
      return withRaw(n, { conditional_routes: routes });
    }
    return withRaw(n, { next_steps: (raw.next_steps || []).filter((t) => t !== targetId) });
  });

// Rename a data name everywhere it is produced or read
const renameData = (nodes, oldName, newName) =>
  nodes.map((n) => {
    const raw = n.data.raw || {};
    const patch = {};
    if (raw.field_name === oldName) patch.field_name = newName;
    if (raw.data_source === oldName) patch.data_source = newName;
    if (raw.inputs?.includes(oldName)) patch.inputs = raw.inputs.map((x) => (x === oldName ? newName : x));
    if (raw.outputs?.includes(oldName)) patch.outputs = raw.outputs.map((x) => (x === oldName ? newName : x));
    return Object.keys(patch).length ? withRaw(n, patch) : n;
  });

// Data names produced by nodes upstream of `id`, and by everything else on the canvas
const dataOptionsFor = (nodes, edges, id) => {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const ancestors = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    edges.forEach((e) => {
      if (e.target === cur && !ancestors.has(e.source)) { ancestors.add(e.source); stack.push(e.source); }
    });
  }
  const upstream = union([], [...ancestors].flatMap((a) => (byId[a] ? getNodeIO(byId[a]).outputs : [])));
  const everywhere = union([], nodes.filter((n) => n.id !== id).flatMap((n) => getNodeIO(n).outputs));
  return { upstream, other: everywhere.filter((x) => !upstream.includes(x)) };
};

// What the panel's "Add" buttons offer for a node
const quickAddOptions = (node) => {
  if (!isStepNode(node)) return { before: [], after: [] };
  if (node.data.stepType === 'input') return { before: INPUT_ITEMS, after: ACTION_ITEMS };
  if (node.data.stepType === 'output') return { before: [], after: OUTPUT_ITEMS };
  if (isConditionalRouter(node)) return { before: [], after: [] };
  return { before: [], after: ACTION_ITEMS };
};

// ========================================================
// 3d. NODE EDITOR (inside the details panel)
// ========================================================
const editInputCls = 'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400';

const EditRow = ({ label, hint, children }) => (
  <div>
    <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
    {children}
    {hint && <div className="text-[11px] text-gray-400 mt-1">{hint}</div>}
  </div>
);

// Text input that only reports its value on blur / Enter (for names that cascade through the graph)
const CommitInput = ({ value, onCommit, transform = (v) => v, ...rest }) => {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => setDraft(value || ''), [value]);
  const commit = () => {
    const v = transform(draft);
    if (v && v !== value) onCommit(v);
    else setDraft(value || '');
  };
  return (
    <input
      {...rest}
      className={editInputCls}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') setDraft(value || '');
      }}
    />
  );
};

const DataChecklist = ({ upstream, other, selected, onChange }) => {
  const orphan = selected.filter((x) => !upstream.includes(x) && !other.includes(x));
  const toggle = (name) => onChange(selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name]);
  const group = (title, names) =>
    names.length > 0 && (
      <div>
        <div className="text-[11px] text-gray-400 mb-1">{title}</div>
        <div className="space-y-1">
          {names.map((name) => (
            <label key={name} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-300" />
              <DataTag name={name} />
            </label>
          ))}
        </div>
      </div>
    );

  if (!upstream.length && !other.length && !orphan.length) {
    return <p className="text-xs text-gray-400">No data on the canvas yet. Connect a previous node or add outputs to one.</p>;
  }
  return (
    <div className="space-y-3">
      {group('From previous nodes', upstream)}
      {group('Elsewhere on the canvas', other)}
      {group('Not produced by any node', orphan)}
    </div>
  );
};

const TagEditor = ({ tags, onAdd, onRemove, placeholder }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = toDataName(draft);
    if (v && !tags.includes(v)) onAdd(v);
    setDraft('');
  };
  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[11px] font-mono text-gray-700">
              {t}
              <button type="button" onClick={() => onRemove(t)} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${t}`}>
                <Icons.X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input className={editInputCls} value={draft} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} disabled={!toDataName(draft)}
          className="shrink-0 px-2.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Add
        </button>
      </div>
    </div>
  );
};

// ---------- Condition editing (shown in the panel's Routing section) ----------
const ConditionEditor = ({ condition, dataNames, onChange }) => {
  const c = condition || emptyCondition(dataNames[0] || '');
  const set = (patch) => onChange({ ...c, ...patch });
  const setRule = (i, patch) => set({ rules: c.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const cls = `${editInputCls} !py-1 !px-2 !text-xs`;

  if (c.mode === 'prompt') {
    return (
      <div>
        <textarea rows={3} className={`${editInputCls} resize-y !text-xs`} value={c.prompt || ''}
          placeholder="e.g. The request is about leave, holidays or company policy"
          onChange={(e) => set({ prompt: e.target.value })} />
        <p className="text-[11px] text-gray-400 mt-1">An agent reads the router’s inputs and decides whether this is true.</p>
        <button type="button" onClick={() => set({ mode: 'rules' })} className="mt-1.5 text-[11px] font-medium text-purple-700 hover:text-purple-900">
          Use a rule instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {c.rules.map((r, i) => {
        const op = OPERATOR_BY_VALUE[r.operator] || CONDITION_OPERATORS[0];
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className="flex items-center gap-2 py-0.5">
                <select className="text-[11px] font-semibold text-gray-600 bg-gray-100 border-0 rounded px-1.5 py-0.5 focus:ring-2 focus:ring-purple-200"
                  value={c.match} onChange={(e) => set({ match: e.target.value })} aria-label="Combine rules with">
                  <option value="all">and</option>
                  <option value="any">or</option>
                </select>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <select className={cls} value={r.source} onChange={(e) => setRule(i, { source: e.target.value })} aria-label="Data to check">
                  <option value="">Choose data…</option>
                  {dataNames.map((x) => <option key={x} value={x}>{x}</option>)}
                  {r.source && !dataNames.includes(r.source) && <option value={r.source}>{r.source}</option>}
                </select>
                <input className={`${cls} !w-28 shrink-0 font-mono`} value={r.path || ''} placeholder="field"
                  onChange={(e) => setRule(i, { path: e.target.value.trim() })} aria-label="Field inside the data (optional)" />
              </div>
              <div className="flex gap-1.5">
                <select className={cls} value={r.operator} onChange={(e) => setRule(i, { operator: e.target.value })} aria-label="Comparison">
                  {CONDITION_OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!op.unary && (
                  <input className={`${cls} !w-28 shrink-0`} value={r.value ?? ''} placeholder="value"
                    onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Value" />
                )}
                {c.rules.length > 1 && (
                  <button type="button" onClick={() => set({ rules: c.rules.filter((_, idx) => idx !== i) })}
                    className="shrink-0 px-1 text-gray-400 hover:text-red-500" aria-label="Remove this rule">
                    <Icons.X size={14} />
                  </button>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={() => set({ rules: [...c.rules, emptyRule(dataNames[0] || '')] })}
          className="inline-flex items-center text-[11px] font-medium text-purple-700 hover:text-purple-900">
          <Icons.Plus size={12} className="mr-0.5" /> Add rule
        </button>
        <button type="button" onClick={() => set({ mode: 'prompt' })} className="text-[11px] font-medium text-gray-500 hover:text-gray-800">
          Describe in words instead
        </button>
      </div>
    </div>
  );
};

const RoutesEditor = ({ node, byId, dataNames, focusKey, onPatch }) => {
  const actions = useContext(RouterActionsContext);
  const raw = node.data.raw || {};
  const kind = routerKind(node);
  const rows = getRouteRows(node);
  const defKey = defaultRouteKey(node);
  const cardRefs = useRef({});

  // Clicking a route on the canvas scrolls to it here and focuses its first control
  useEffect(() => {
    const el = focusKey && cardRefs.current[focusKey.key];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.querySelector('select, input, textarea')?.focus({ preventScroll: true });
  }, [focusKey]);

  const setCondition = (key, condition) =>
    onPatch({ route_conditions: { ...(raw.route_conditions || {}), [key]: condition } });

  const move = (key, delta) => {
    const entries = Object.entries(raw.conditional_routes || {});
    const main = entries.filter(([k]) => k !== defKey);
    const i = main.findIndex(([k]) => k === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= main.length) return;
    [main[i], main[j]] = [main[j], main[i]];
    onPatch({ conditional_routes: Object.fromEntries([...main, ...entries.filter(([k]) => k === defKey)]) });
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        {kind === 'if_else'
          ? 'The flow goes to If when its condition is true, and to Else otherwise.'
          : 'Every case whose condition is true is followed, so two cases with the same condition run in parallel. Otherwise runs only when no case matches.'}
      </p>

      {rows.map((r, i) => {
        const focused = focusKey?.key === r.key;
        const target = r.target ? byId[r.target] : null;
        const caseCount = rows.filter((x) => !x.isDefault).length;
        return (
          <div key={r.key} ref={(el) => { cardRefs.current[r.key] = el; }}
            className={`rounded-lg border bg-white transition-shadow ${focused ? 'border-purple-400 ring-2 ring-purple-100' : !r.complete ? 'border-red-200' : 'border-gray-200'
              }`}>
            {/* Route header */}
            <div className="flex items-center gap-2 px-2.5 pt-2.5">
              <span className={`shrink-0 min-w-[34px] text-center px-1.5 py-0.5 rounded text-[10px] font-bold ${r.isDefault ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-800'
                }`}>
                {routeBadge(node, r, i)}
              </span>
              {kind === 'switch' && !r.isDefault && (
                <div className="w-32 min-w-0">
                  <CommitInput value={r.key} transform={(v) => v.trim().replace(/[^A-Za-z0-9_]+/g, '_')} onCommit={(v) => actions.renameRoute(node.id, r.key, v)}
                    aria-label="Case name" />
                </div>
              )}
              {kind === 'switch' && !r.isDefault && (
                <div className="ml-auto flex items-center shrink-0 text-gray-400">
                  <button type="button" onClick={() => move(r.key, -1)} disabled={i === 0} className="p-0.5 hover:text-gray-700 disabled:opacity-30" aria-label="Check earlier">
                    <Icons.ChevronUp size={15} />
                  </button>
                  <button type="button" onClick={() => move(r.key, 1)} disabled={i === caseCount - 1} className="p-0.5 hover:text-gray-700 disabled:opacity-30" aria-label="Check later">
                    <Icons.ChevronDown size={15} />
                  </button>
                  <button type="button" onClick={() => actions.removeRoute(node.id, r.key)} disabled={caseCount <= 1}
                    className="p-0.5 hover:text-red-500 disabled:opacity-30" aria-label="Remove this case">
                    <Icons.Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Condition */}
            <div className="px-2.5 py-2.5">
              {r.isDefault ? (
                <p className="text-xs text-gray-500">
                  {kind === 'if_else' ? 'Taken when the If condition is false.' : 'Taken when no case above matches. Leave it unconnected to stop the flow instead.'}
                </p>
              ) : (
                <ConditionEditor condition={r.condition} dataNames={dataNames} onChange={(c) => setCondition(r.key, c)} />
              )}
            </div>

            {/* Destination */}
            <div className="flex items-center gap-2 px-2.5 py-2 border-t border-gray-100 bg-gray-50/70 rounded-b-lg">
              <span className="text-[11px] text-gray-500 shrink-0">Goes to</span>
              {target ? (
                <NodeChip node={target} onSelect={actions.select} />
              ) : (
                <>
                  <span className="text-[11px] text-gray-400 italic">nothing yet</span>
                  <button type="button" onClick={() => actions.addStepOnRoute(node.id, r.key)}
                    className="ml-auto inline-flex items-center text-[11px] font-medium text-purple-700 hover:text-purple-900 shrink-0">
                    <Icons.Plus size={12} className="mr-0.5" /> Add step
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {kind === 'switch' && (
        <button type="button" onClick={() => actions.addCase(node.id)}
          className="w-full inline-flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-purple-700 hover:bg-purple-50 hover:border-purple-300">
          <Icons.Plus size={13} /> Add case
        </button>
      )}
      {dataNames.length === 0 && (
        <p className="text-[11px] text-gray-400">Connect a step into this router so its conditions have data to check.</p>
      )}
    </div>
  );
};

const NodeEditor = ({ node, nodes, edges, onPatch, onRename, onAddOutput }) => {
  const d = node.data;
  const raw = d.raw || {};
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const { upstream, other } = dataOptionsFor(nodes, edges, node.id);

  if (d.kind === 'input_field') {
    return (
      <div className="space-y-3">
        <EditRow label="Label">
          <input className={editInputCls} value={raw.label || ''} onChange={(e) => onPatch({ label: e.target.value })} />
        </EditRow>
        <EditRow label="Field name" hint="Other nodes read this value by this name. Renaming updates them too.">
          <CommitInput value={raw.field_name} transform={toDataName} onCommit={(v) => onRename(raw.field_name, v)} />
        </EditRow>
        <EditRow label="Type">
          <select className={editInputCls} value={raw.field_type} onChange={(e) => onPatch({ field_type: e.target.value })}>
            {INPUT_ITEMS.map((i) => <option key={i.fieldType} value={i.fieldType}>{i.title}</option>)}
          </select>
        </EditRow>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={!!raw.required} onChange={(e) => onPatch({ required: e.target.checked })}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-300" />
          Required
        </label>
        <EditRow label="Placeholder">
          <input className={editInputCls} value={raw.placeholder || ''} onChange={(e) => onPatch({ placeholder: e.target.value || null })} />
        </EditRow>
        {raw.field_type === 'dropdown' && (
          <EditRow label="Options" hint="Separate options with commas.">
            <CommitInput
              value={(raw.options || []).map((o) => (typeof o === 'object' ? o.label ?? o.value : o)).join(', ')}
              onCommit={(v) => onPatch({ options: v.split(',').map((x) => x.trim()).filter(Boolean) })}
            />
          </EditRow>
        )}
      </div>
    );
  }

  if (d.kind === 'output_component') {
    return (
      <div className="space-y-3">
        <EditRow label="Title">
          <input className={editInputCls} value={raw.component_title || ''} onChange={(e) => onPatch({ component_title: e.target.value })} />
        </EditRow>
        <EditRow label="Type">
          <select className={editInputCls} value={raw.component_type} onChange={(e) => onPatch({ component_type: e.target.value })}>
            {OUTPUT_ITEMS.map((i) => <option key={i.fieldType} value={i.fieldType}>{i.title}</option>)}
          </select>
        </EditRow>
        <EditRow label="Data source" hint="The data this component displays.">
          <select className={editInputCls} value={raw.data_source || ''} onChange={(e) => onPatch({ data_source: e.target.value })}>
            <option value="">Choose data…</option>
            {upstream.length > 0 && <optgroup label="From previous nodes">{upstream.map((x) => <option key={x} value={x}>{x}</option>)}</optgroup>}
            {other.length > 0 && <optgroup label="Elsewhere on the canvas">{other.map((x) => <option key={x} value={x}>{x}</option>)}</optgroup>}
            {raw.data_source && !upstream.includes(raw.data_source) && !other.includes(raw.data_source) && (
              <option value={raw.data_source}>{raw.data_source} (not produced)</option>
            )}
          </select>
        </EditRow>
        <EditRow label="Width">
          <select className={editInputCls} value={raw.layout_span || 'full'} onChange={(e) => onPatch({ layout_span: e.target.value })}>
            <option value="full">Full width</option>
            <option value="half">Half width</option>
            <option value="third">One third</option>
          </select>
        </EditRow>
      </div>
    );
  }

  // Steps
  return (
    <div className="space-y-4">
      <EditRow label="Name">
        <input className={editInputCls} value={raw.step_name || ''} onChange={(e) => onPatch({ step_name: e.target.value })} />
      </EditRow>

      {d.stepType === 'agent_action' && (
        <>
          <EditRow label="Agent ID">
            <input className={`${editInputCls} font-mono`} value={raw.agent_id || ''} placeholder="agt_…"
              onChange={(e) => onPatch({ agent_id: e.target.value.trim() || null })} />
          </EditRow>
          <EditRow label="Task instruction">
            <textarea rows={6} className={`${editInputCls} resize-y text-xs leading-relaxed`} value={raw.task_instruction || ''}
              placeholder="Describe what this agent should do with its inputs…"
              onChange={(e) => onPatch({ task_instruction: e.target.value })} />
          </EditRow>
        </>
      )}


      {d.stepType === 'input' ? (
        <EditRow label="Provides" hint="Connect input fields to this step to add to this list.">
          {(raw.outputs || []).length ? (
            <div className="flex flex-wrap gap-1.5">{raw.outputs.map((o) => <DataTag key={o} name={o} />)}</div>
          ) : <p className="text-xs text-gray-400">No input fields connected yet.</p>}
        </EditRow>
      ) : (
        <EditRow label={raw.router_type === 'merge' ? 'Waits for' : 'Reads'}>
          <DataChecklist upstream={upstream} other={other} selected={raw.inputs || []} onChange={(inputs) => onPatch({ inputs })} />
        </EditRow>
      )}

      {d.stepType === 'agent_action' && (
        <EditRow label="Produces" hint="New outputs are also added to the nodes this step connects to.">
          <TagEditor tags={raw.outputs || []} placeholder="e.g. summary_report"
            onAdd={onAddOutput}
            onRemove={(t) => onPatch({ outputs: (raw.outputs || []).filter((x) => x !== t) })} />
        </EditRow>
      )}
    </div>
  );
};

// ========================================================
// 4. CORE CANVAS LOGIC
// ========================================================
const FlowArea = ({ nodes, setNodes, edges, setEdges, prompt }) => {
  const reactFlowInstance = useReactFlow();

  // ----- Selection / panel state -----
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [focusRoute, setFocusRoute] = useState(null); // { nodeId, key, at } — route to scroll to in the panel
  const selectedNode = nodes.find((n) => n.id === selectedId) || null; // panel closes itself if the node is deleted

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const selectOnly = useCallback((id) => {
    setSelectedId(id);
    setNodes((nds) => nds.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })));
  }, [setNodes]);

  // ----- React Flow change handlers (keep the backend model in sync) -----
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), [setNodes]);

  const onEdgesChange = useCallback((changes) => {
    const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
    if (removedIds.size) {
      const removed = edges.filter((e) => removedIds.has(e.id));
      setNodes((nds) => removed.reduce((acc, e) => unlink(acc, e.source, e.target, e.sourceHandle), nds));
    }
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, [edges, setEdges, setNodes]);

  const onNodesDelete = useCallback((deleted) => {
    const gone = new Set(deleted.map((n) => n.id));
    setNodes((nds) => {
      let out = nds;
      nds.forEach((n) => {
        if (!isStepNode(n) || gone.has(n.id)) return;
        const raw = n.data.raw || {};
        union(raw.next_steps, Object.values(raw.conditional_routes || {}))
          .filter((t) => gone.has(t))
          .forEach((t) => { out = unlink(out, n.id, t); });
      });
      return out;
    });
  }, [setNodes]);

  // ----- Connecting nodes -----
  const connect = useCallback((sourceId, targetId, sourceHandle = null) => {
    const problem = connectionProblem(nodes, edges, sourceId, targetId, sourceHandle);
    if (problem) { setToast(problem); return false; }
    const source = nodes.find((n) => n.id === sourceId);
    const target = nodes.find((n) => n.id === targetId);
    const handle = isConditionalRouter(source) ? resolveRouteHandle(source, sourceHandle) : null;
    // A route leads to one step: drawing from a connected route moves it
    setEdges((eds) => eds
      .filter((e) => !(handle && e.source === sourceId && e.sourceHandle === handle))
      .concat(makeEdge(source, target, handle)));
    setNodes((nds) => applyConnection(nds, sourceId, targetId, handle));
    return true;
  }, [nodes, edges, setEdges, setNodes]);

  const onConnect = useCallback((params) => connect(params.source, params.target, params.sourceHandle), [connect]);

  // ----- Adding nodes -----
  const addNodeAndFocus = useCallback((node, link) => {
    setNodes((nds) => {
      let next = nds.map((n) => (n.selected ? { ...n, selected: false } : n)).concat({ ...node, selected: true });
      if (link) next = applyConnection(next, link.source, link.target, link.handle || null);
      return next;
    });
    if (link) {
      const src = link.source === node.id ? node : nodes.find((n) => n.id === link.source);
      const tgt = link.target === node.id ? node : nodes.find((n) => n.id === link.target);
      setEdges((eds) => eds.concat(makeEdge(src, tgt, link.handle || null)));
    }
    setSelectedId(node.id);
    setEditingId(node.id);
  }, [nodes, setNodes, setEdges]);

  // Toolbar drag-and-drop
  const onDrop = useCallback((event) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData('application/reactflow');
    if (!payload) return;
    const item = JSON.parse(payload);

    let position;
    if (reactFlowInstance.screenToFlowPosition) {
      position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    } else {
      const bounds = event.currentTarget.getBoundingClientRect();
      position = reactFlowInstance.project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    }
    position.x -= 128;
    position.y -= 40;

    addNodeAndFocus(createToolboxNode(item, position));
  }, [reactFlowInstance, addNodeAndFocus]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Panel quick-add: create a node beside the anchor and connect it
  const quickAdd = useCallback((anchorId, item, direction) => {
    const anchor = nodes.find((n) => n.id === anchorId);
    if (!anchor) return;
    const siblings = direction === 'before'
      ? edges.filter((e) => e.target === anchorId).length
      : edges.filter((e) => e.source === anchorId).length;
    const position = {
      x: anchor.position.x + (direction === 'before' ? -330 : 330),
      y: anchor.position.y + siblings * 120,
    };
    const node = createToolboxNode(item, position);
    const link = direction === 'before' ? { source: node.id, target: anchorId } : { source: anchorId, target: node.id };
    addNodeAndFocus(node, link);
    setTimeout(() => reactFlowInstance.setCenter(position.x + 128, position.y + 40, {
      zoom: Math.max(reactFlowInstance.getZoom(), 0.9), duration: 400,
    }), 0);
  }, [nodes, edges, addNodeAndFocus, reactFlowInstance]);

  // ----- Editing -----
  const patchNode = useCallback((id, patch) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? withRaw(n, patch) : n)));
  }, [setNodes]);

  const renameDataName = useCallback((oldName, newName) => {
    setNodes((nds) => renameData(nds, oldName, newName));
  }, [setNodes]);

  // New output: add it, then hand it to the nodes this step already connects to
  const addOutput = useCallback((id, name) => {
    const targets = new Set(edges.filter((e) => e.source === id).map((e) => e.target));
    setNodes((nds) => nds.map((n) => {
      if (n.id === id) return withRaw(n, { outputs: union(n.data.raw.outputs, [name]) });
      if (!targets.has(n.id)) return n;
      if (n.data.kind === 'output_component') return n.data.raw.data_source ? n : withRaw(n, { data_source: name });
      if (isStepNode(n) && n.data.stepType !== 'input') return withRaw(n, { inputs: union(n.data.raw.inputs, [name]) });
      return n;
    }));
  }, [edges, setNodes]);

  // ----- Router actions -----
  const editRoute = useCallback((nodeId, key) => {
    selectOnly(nodeId);
    setFocusRoute({ nodeId, key, at: Date.now() });
  }, [selectOnly]);

  const addCase = useCallback((nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const raw = node.data.raw || {};
    const key = nextCaseKey(raw);
    const defKey = defaultRouteKey(node);
    const entries = Object.entries(raw.conditional_routes || {});
    patchNode(nodeId, {
      conditional_routes: Object.fromEntries([
        ...entries.filter(([k]) => k !== defKey), [key, null], ...entries.filter(([k]) => k === defKey),
      ]),
      route_conditions: { ...(raw.route_conditions || {}), [key]: emptyCondition(raw.inputs?.[0] || '') },
      default_route: raw.default_route || defKey,
    });
    editRoute(nodeId, key);
  }, [nodes, patchNode, editRoute]);

  const renameRoute = useCallback((nodeId, oldKey, newKey) => {
    const node = nodes.find((n) => n.id === nodeId);
    const raw = node?.data.raw || {};
    if (!node || !newKey || newKey === oldKey || newKey in (raw.conditional_routes || {})) return;
    const rename = (obj) => obj && Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === oldKey ? newKey : k, v]));
    patchNode(nodeId, {
      conditional_routes: rename(raw.conditional_routes),
      route_conditions: rename(raw.route_conditions),
      default_route: raw.default_route === oldKey ? newKey : raw.default_route ?? null,
    });
    setEdges((eds) => eds.map((e) =>
      e.source === nodeId && e.sourceHandle === oldKey
        ? { ...e, sourceHandle: newKey, id: `e-${nodeId}-${newKey}-${e.target}` }
        : e));
  }, [nodes, patchNode, setEdges]);

  const removeRoute = useCallback((nodeId, key) => {
    const node = nodes.find((n) => n.id === nodeId);
    const raw = node?.data.raw || {};
    if (!node) return;
    const drop = (obj) => obj && Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
    patchNode(nodeId, { conditional_routes: drop(raw.conditional_routes), route_conditions: drop(raw.route_conditions) });
    setEdges((eds) => eds.filter((e) => !(e.source === nodeId && e.sourceHandle === key)));
  }, [nodes, patchNode, setEdges]);

  const addStepOnRoute = useCallback((nodeId, key) => {
    const router = nodes.find((n) => n.id === nodeId);
    if (!router) return;
    const rowIndex = Math.max(0, getRouteRows(router).findIndex((r) => r.key === key));
    const position = { x: router.position.x + 380, y: router.position.y + rowIndex * 130 };
    const step = createToolboxNode(ACTION_ITEMS.find((i) => i.fieldType === 'agent_action'), position);
    addNodeAndFocus(step, { source: nodeId, target: step.id, handle: key });
    setTimeout(() => reactFlowInstance.setCenter(position.x + 128, position.y + 40, {
      zoom: Math.max(reactFlowInstance.getZoom(), 0.9), duration: 400,
    }), 0);
  }, [nodes, addNodeAndFocus, reactFlowInstance]);

  // ----- Selection handlers -----
  const onNodeClick = useCallback((_, node) => {
    setSelectedId(node.id);
    setEditingId((cur) => (cur === node.id ? cur : null));
  }, []);
  const onPaneClick = useCallback(() => { setSelectedId(null); setEditingId(null); }, []);

  const selectFromPanel = useCallback((id) => {
    selectOnly(id);
    setEditingId(null);
    const target = reactFlowInstance.getNode(id);
    if (target) {
      reactFlowInstance.setCenter(target.position.x + 128, target.position.y + 40, {
        zoom: Math.max(reactFlowInstance.getZoom(), 0.9), duration: 400,
      });
    }
  }, [reactFlowInstance, selectOnly]);

  const titles = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n.data.title])), [nodes]);
  const routerActions = useMemo(() => ({
    editRoute, addCase, renameRoute, removeRoute, addStepOnRoute,
    select: selectFromPanel,
    titleOf: (id) => titles[id],
  }), [editRoute, addCase, renameRoute, removeRoute, addStepOnRoute, selectFromPanel, titles]);

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setEditingId(null);
    setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
  }, [setNodes]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, closePanel]);

  // Emphasise edges touching the selected node, fade the rest
  const displayEdges = useMemo(() => {
    if (!selectedId) return edges;
    return edges.map((e) => {
      const touches = e.source === selectedId || e.target === selectedId;
      return {
        ...e,
        zIndex: touches ? 1 : 0,
        style: {
          ...e.style,
          stroke: touches ? '#7c3aed' : e.style?.stroke,
          strokeWidth: touches ? 2.5 : e.style?.strokeWidth ?? 2,
          opacity: touches ? 1 : 0.3,
        },
      };
    });
  }, [edges, selectedId]);

  return (
    <RouterActionsContext.Provider value={routerActions}>
      <div className="w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          onDrop={onDrop}
          onDragOver={onDragOver}
          connectionLineStyle={{ stroke: '#7c3aed', strokeWidth: 2 }}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Background color="#cbd5e1" gap={24} size={2} />
          <Controls className="bg-white shadow-md border border-gray-200 rounded-lg fill-gray-600 mb-20" />

          {/* Chat bar pinned inside canvas */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-3/4 max-w-4xl z-10 pointer-events-auto">
            <div className="bg-white rounded-xl shadow-lg border border-purple-300 ring-4 ring-purple-50 flex items-center p-3 pl-5">
              <input type="text" defaultValue={prompt} className="flex-1 bg-transparent border-none focus:outline-none text-gray-700 text-sm" />
              <div className="flex items-center space-x-3 shrink-0">
                <Icons.Paperclip size={20} className="text-gray-400" />
                <Icons.Mic size={20} className="text-gray-400" />
                <button className="p-2 bg-white text-blue-700 hover:bg-blue-50 rounded-full transition"><Icons.Send size={20} /></button>
              </div>
            </div>
          </div>
        </ReactFlow>

        {/* Connection feedback */}
        {toast && (
          <div role="status" className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
            <Icons.AlertCircle size={16} className="text-amber-300 shrink-0" />
            {toast}
          </div>
        )}

        {selectedNode && (
          <NodeDetailsPanel
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            editing={editingId === selectedNode.id}
            onToggleEdit={() => setEditingId((cur) => (cur === selectedNode.id ? null : selectedNode.id))}
            onPatch={(patch) => patchNode(selectedNode.id, patch)}
            onRename={renameDataName}
            onAddOutput={(name) => addOutput(selectedNode.id, name)}
            onQuickAdd={(item, direction) => quickAdd(selectedNode.id, item, direction)}
            focusRoute={focusRoute}
            onSelect={selectFromPanel}
            onClose={closePanel}
          />
        )}
      </div>
    </RouterActionsContext.Provider>
  );
};

// ========================================================
// 4b. PREVIEW SOLUTION (input form + output layout)
// ========================================================

// Nodes are read top-to-bottom (then left-to-right), so rearranging on the canvas reorders the preview
const byPosition = (a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x);

const SPAN_CLASS = {
  full: 'md:col-span-6',
  half: 'md:col-span-3',
  third: 'md:col-span-2',
};

const isEmptyValue = (v) =>
  v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');

// ---------- Input controls (shadcn/ui) ----------
const FileDropField = ({ id, files = [], onChange, hasError }) => {
  const [isOver, setIsOver] = useState(false);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length) onChange([...files, ...incoming]);
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsOver(false); addFiles(e.dataTransfer.files); }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isOver ? 'border-primary bg-primary/5' : hasError ? 'border-destructive bg-destructive/5' : 'border-input bg-muted/40 hover:bg-muted'
        )}
      >
        <Icons.UploadCloud className="h-6 w-6 text-muted-foreground mb-1" />
        <span className="text-sm">
          Drop files here or <span className="font-medium text-primary underline-offset-4 hover:underline">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">You can add more than one file</span>
        <input
          id={id}
          type="file"
          multiple
          className="sr-only"
          aria-invalid={hasError || undefined}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-background pl-3 pr-1 py-1 text-sm">
              <Icons.File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${f.name}`}
              >
                <Icons.X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const FieldControl = ({ id, field, value, onChange, hasError }) => {
  const invalid = hasError || undefined;

  switch (field.field_type) {
    case 'textarea':
      return (
        <Textarea id={id} rows={6} className="resize-y" placeholder={field.placeholder || ''}
          aria-invalid={invalid} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      );
    case 'dropdown': {
      const options = (field.options || []).map((o) =>
        typeof o === 'object' ? { label: o.label ?? o.value, value: String(o.value ?? o.label) } : { label: String(o), value: String(o) });
      return (
        <NativeSelect id={id} className="w-full" aria-invalid={invalid} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <NativeSelectOption value="">{field.placeholder || 'Select an option'}</NativeSelectOption>
          {options.map((o) => <NativeSelectOption key={o.value} value={o.value}>{o.label}</NativeSelectOption>)}
        </NativeSelect>
      );
    }
    case 'file_upload':
      return <FileDropField id={id} files={value || []} onChange={onChange} hasError={hasError} />;
    default:
      return (
        <Input id={id} type="text" placeholder={field.placeholder || ''}
          aria-invalid={invalid} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      );
  }
};

// ---------- Running the solution: /api/run/{flow_id} ----------
// FastAPI errors look like {"detail": "..."}; 422 validation errors are
// {"detail": [{"loc": ["body", "graph", "steps", 0, "step_id"], "msg": "Field required", ...}]}
const readErrorDetail = async (response) => {
  let body;
  try { body = await response.json(); } catch { return ''; }
  const detail = body?.detail ?? body?.error ?? body?.message ?? '';
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const loc = (d.loc || []).filter((part) => part !== 'body').join(' → ');
        return loc ? `${loc}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
};

const errorFromResponse = async (response) => {
  const detail = await readErrorDetail(response);
  return new Error(detail ? `${response.status}: ${detail}` : `The server responded with ${response.status}.`);
};

// JSON when there are no files: { inputs: { field_name: value } }
// multipart/form-data when there are files: each file under its field_name, text fields as
// form fields, plus an `inputs` JSON string with all text values.
const buildRunRequest = (fields, values) => {
  const textInputs = {};
  fields.forEach((f) => {
    const v = values[f.field_name];
    if (f.field_type !== 'file_upload' && !isEmptyValue(v)) textInputs[f.field_name] = v;
  });

  const hasFiles = fields.some((f) => f.field_type === 'file_upload' && (values[f.field_name] || []).length > 0);
  if (!hasFiles) {
    return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: textInputs }) };
  }

  const fd = new FormData();
  fields.forEach((f) => {
    if (f.field_type === 'file_upload') (values[f.field_name] || []).forEach((file) => fd.append(f.field_name, file, file.name));
  });
  Object.entries(textInputs).forEach(([k, v]) => fd.append(k, v));
  fd.append('inputs', JSON.stringify(textInputs));
  return { body: fd }; // the browser sets the multipart boundary itself
};

// Turns a run response into the components to render.
//  - List format (current backend): [{ component_id, component_title, component_type, layout_span, data }, ...]
//    also accepted wrapped as { components | outputs | results: [...] }. Only these are shown, in this order.
//  - Keyed format: { outputs: { data_source: value } } etc. Only canvas components whose data_source came back are shown.
const normalizeRunResponse = (data, canvasComponents) => {
  const list = Array.isArray(data) ? data
    : ['components', 'outputs', 'results', 'output_components'].map((k) => data?.[k]).find(Array.isArray) || null;

  if (list) {
    const items = list
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => {
        const canvas = canvasComponents.find((k) => k.component_id === c.component_id);
        return {
          component_id: c.component_id || `returned_${i}`,
          component_title: c.component_title ?? canvas?.component_title ?? 'Result',
          component_type: c.component_type || canvas?.component_type || 'markdown',
          layout_span: c.layout_span || canvas?.layout_span || 'full',
          data_source: c.data_source ?? canvas?.data_source ?? '',
          data: 'data' in c ? c.data : c.value,
        };
      });
    return { items, notReturned: [] };
  }

  const outputs = extractRunOutputs(data);
  return {
    items: canvasComponents.filter((c) => c.data_source in outputs).map((c) => ({ ...c, data: outputs[c.data_source] })),
    notReturned: canvasComponents.filter((c) => !(c.data_source in outputs)),
  };
};

// Accepts { outputs: {...} }, { results: {...} }, { result: {...} }, { data: {...} } or a flat object
const extractRunOutputs = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  for (const key of ['outputs', 'results', 'result', 'data']) {
    const v = data[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  }
  return data;
};

const tryParseJson = (v) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return v;
  try { return JSON.parse(t); } catch { return v; }
};

const formatDuration = (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);

// ---------- Markdown (react-markdown + GFM, styled like shadcn typography) ----------
const markdownComponents = {
  h1: ({ node, ...p }) => <h2 className="mt-6 scroll-m-20 text-2xl font-bold tracking-tight first:mt-0" {...p} />,
  h2: ({ node, ...p }) => <h3 className="mt-6 scroll-m-20 border-b pb-1.5 text-lg font-semibold tracking-tight first:mt-0" {...p} />,
  h3: ({ node, ...p }) => <h4 className="mt-5 scroll-m-20 text-base font-semibold first:mt-0" {...p} />,
  h4: ({ node, ...p }) => <h5 className="mt-4 text-sm font-semibold first:mt-0" {...p} />,
  p: ({ node, ...p }) => <p className="leading-7 [&:not(:first-child)]:mt-3" {...p} />,
  ul: ({ node, ...p }) => <ul className="my-3 ml-6 list-disc marker:text-muted-foreground [&_ul]:my-1.5 [&>li]:mt-1.5" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-3 ml-6 list-decimal marker:text-muted-foreground [&_ol]:my-1.5 [&>li]:mt-1.5" {...p} />,
  li: ({ node, ...p }) => <li className="leading-7" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
  a: ({ node, ...p }) => <a className="font-medium text-primary underline underline-offset-4" target="_blank" rel="noreferrer" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="mt-4 border-l-2 pl-4 italic text-muted-foreground" {...p} />,
  hr: () => <hr className="my-6 border-border" />,
  code: ({ node, className, children, ...p }) =>
    /language-/.test(className || '')
      ? <code className={cn('font-mono text-sm', className)} {...p}>{children}</code>
      : <code className="rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-[0.85em]" {...p}>{children}</code>,
  pre: ({ node, ...p }) => <pre className="my-4 overflow-x-auto rounded-lg bg-muted p-4" {...p} />,
  table: ({ node, ...p }) => <div className="my-4 overflow-hidden rounded-lg border"><Table {...p} /></div>,
  thead: ({ node, ...p }) => <TableHeader {...p} />,
  tbody: ({ node, ...p }) => <TableBody {...p} />,
  tr: ({ node, ...p }) => <TableRow {...p} />,
  th: ({ node, ...p }) => <TableHead {...p} />,
  td: ({ node, ...p }) => <TableCell {...p} />,
};

// The card already shows the component title, so drop a leading heading that repeats it
const stripRepeatedTitle = (text, title) => {
  if (!title) return text;
  const norm = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const m = first >= 0 && lines[first].match(/^#{1,3}\s+(.*)$/);
  return m && norm(m[1]) === norm(title) ? lines.slice(first + 1).join('\n').replace(/^\s+/, '') : text;
};

const SimpleMarkdown = ({ text, title }) => (
  <div className="text-sm text-foreground/90">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {stripRepeatedTitle(String(text).replace(/\r\n/g, '\n'), title)}
    </ReactMarkdown>
  </div>
);

const JsonBlock = ({ value }) => (
  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
    {JSON.stringify(value, null, 2)}
  </pre>
);

// Output renderers (shadcn/ui). `data` is whatever the run returned for the component's data_source.
const DataTableOutput = ({ data }) => {
  let value = tryParseJson(data);
  // Accept an object that wraps the array, e.g. { candidates: [...] }
  if (value && !Array.isArray(value) && typeof value === 'object') {
    const inner = Object.values(value).find(Array.isArray);
    value = inner || [value];
  }
  if (!Array.isArray(value)) return <SimpleMarkdown text={String(value)} />;
  if (value.length === 0) return <p className="text-sm text-muted-foreground">No rows returned.</p>;
  const rows = value.map((r) => (r && typeof r === 'object' ? r : { value: r }));
  const columns = union([], rows.flatMap((r) => Object.keys(r)));
  const cell = (v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => <TableCell key={c} className="align-top">{cell(row[c])}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const MarkdownOutput = ({ data, title }) => {
  const value = tryParseJson(data);
  if (value != null && typeof value === 'object') return <JsonBlock value={value} />;
  const text = String(value ?? '');
  return text.trim() ? <SimpleMarkdown text={text} title={title} /> : <p className="text-sm text-muted-foreground">The run returned an empty value.</p>;
};

const MetricCardsOutput = ({ data }) => {
  const value = tryParseJson(data);
  let entries = [];
  if (Array.isArray(value)) entries = value.map((m, i) => [m?.label ?? m?.name ?? `Metric ${i + 1}`, m?.value ?? m]);
  else if (value && typeof value === 'object') entries = Object.entries(value);
  else entries = [['Value', value]];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {entries.map(([label, val]) => (
        <Card key={label} size="sm">
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="truncate text-2xl tabular-nums">
              {typeof val === 'object' ? JSON.stringify(val) : String(val)}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
};

const FileDownloadOutput = ({ data, source }) => {
  const value = tryParseJson(data);
  const obj = value && typeof value === 'object' ? value : { url: value };
  const ref = obj.url || obj.download_url || obj.href || obj.path || obj.file_path || '';
  const isLink = /^(https?:|\/|data:|blob:)/.test(ref);
  const name = obj.name || obj.filename || obj.file_name || String(ref).split(/[\\/]/).pop() || source || 'result';

  return (
    <Item variant="outline">
      <ItemMedia variant="icon">
        <Icons.FileText />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="truncate">{name}</ItemTitle>
        <ItemDescription className="truncate">
          {isLink ? 'Ready to download' : ref ? `Saved on the server at ${ref}` : 'No file reference returned'}
        </ItemDescription>
      </ItemContent>
      {isLink && (
        <ItemActions>
          <a href={ref} download={name} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm' })}>
            <Icons.Download data-icon="inline-start" /> Download
          </a>
        </ItemActions>
      )}
    </Item>
  );
};

// Empty / waiting / problem states, using shadcn's Empty
const OutputPlaceholder = ({ icon: Icon = Icons.Inbox, title, children }) => (
  <EmptyState className="border border-dashed">
    <EmptyHeader>
      <EmptyMedia variant="icon"><Icon /></EmptyMedia>
      {title && <EmptyTitle>{title}</EmptyTitle>}
      {children && <EmptyDescription>{children}</EmptyDescription>}
    </EmptyHeader>
  </EmptyState>
);

const OutputCard = ({ comp, status, data }) => {
  const meta = OUTPUT_BY_TYPE[comp.component_type] || OUTPUT_BY_TYPE.markdown;
  const Icon = Icons[meta.iconName] || Icons.FileText;
  const missing = status === 'done' && data === undefined;

  let body;
  if (status === 'idle') {
    body = <OutputPlaceholder icon={Icon} title="Nothing yet">Run the solution to fill this {meta.title.toLowerCase()}.</OutputPlaceholder>;
  } else if (status === 'running') {
    body = (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  } else if (status === 'error') {
    body = <OutputPlaceholder icon={Icons.XCircle} title="No result">The run failed before producing this.</OutputPlaceholder>;
  } else if (missing) {
    body = (
      <OutputPlaceholder icon={Icons.AlertTriangle} title="Not returned">
        The run didn’t return “{comp.data_source || 'no data source set'}”.
      </OutputPlaceholder>
    );
  } else {
    switch (comp.component_type) {
      case 'data_table': body = <DataTableOutput data={data} />; break;
      case 'metric_cards': body = <MetricCardsOutput data={data} />; break;
      case 'file_download': body = <FileDownloadOutput data={data} source={comp.data_source} />; break;
      default: body = <MarkdownOutput data={data} title={comp.component_title} />;
    }
  }

  return (
    <Card className={cn('col-span-6 min-w-0', SPAN_CLASS[comp.layout_span] || SPAN_CLASS.full)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{comp.component_title}</span>
        </CardTitle>
        {comp.data_source && <CardDescription className="truncate font-mono text-xs">{comp.data_source}</CardDescription>}
        {status === 'done' && !missing && (
          <CardAction>
            <Badge variant="secondary">
              <Icons.Check data-icon="inline-start" /> Ready
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex-1">{body}</CardContent>
    </Card>
  );
};

const PreviewSolution = ({ nodes, appName, appDescription, forgeId, hasUnsentChanges, onClose }) => {
  const fields = nodes.filter((n) => n.data.kind === 'input_field').sort(byPosition).map((n) => n.data.raw);
  const components = nodes.filter((n) => n.data.kind === 'output_component').sort(byPosition).map((n) => n.data.raw);

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [results, setResults] = useState(null);
  const [runError, setRunError] = useState('');
  const [runMeta, setRunMeta] = useState(null); // { ms, runId, rawKeys }
  const abortRef = useRef(null);

  // Stop an in-flight run if the preview closes
  useEffect(() => () => abortRef.current?.abort(), []);
  const [screen, setScreen] = useState('input'); // input | output

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setValue = (name, v) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleRun = async () => {
    const nextErrors = {};
    fields.forEach((f) => {
      if (f.required && isEmptyValue(values[f.field_name])) {
        nextErrors[f.field_name] = `Add ${String(f.label || f.field_name).toLowerCase()} to run the solution.`;
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setScreen('input'); return; }

    setScreen('output');

    if (forgeId === '' || forgeId == null) {
      setStatus('error');
      setRunError('This solution has no flow ID yet. Build or recompile it first.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();

    setStatus('running');
    setRunError('');
    setResults(null);
    setRunMeta(null);

    try {
      const response = await fetch(`/api/run/${encodeURIComponent(forgeId)}`, {
        method: 'POST',
        ...buildRunRequest(fields, values),
        signal: controller.signal,
      });
      if (!response.ok) throw await errorFromResponse(response);
      const data = await response.json().catch(() => {
        throw new Error('The server responded, but not with JSON.');
      });
      const rendered = normalizeRunResponse(data, components);
      setResults(rendered);
      setRunMeta({
        ms: Math.round(performance.now() - started),
        runId: Array.isArray(data) ? null : data?.run_id ?? data?.id ?? null,
      });
      setStatus('done');
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      console.warn('Run failed:', error);
      setRunError(error.message);
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const handleReset = () => {
    abortRef.current?.abort();
    setRunError('');
    setRunMeta(null);
    setValues({});
    setErrors({});
    setResults(null);
    setStatus('idle');
    setScreen('input');
  };

  // ---------- Screen: Inputs ----------
  const inputScreen = (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{appName || 'Untitled solution'}</h1>
          {appDescription && <p className="mt-2 leading-relaxed text-muted-foreground">{appDescription}</p>}
        </div>

        {hasUnsentChanges && (
          <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 [&>svg]:text-amber-600">
            <Icons.AlertTriangle className="h-4 w-4" />
            <AlertTitle>Changes not recompiled</AlertTitle>
            <AlertDescription>
              This run uses the last compiled version of flow {String(forgeId)}. Close the preview and click Recompile to include your latest canvas changes.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); handleRun(); }} noValidate>
              {fields.length === 0 ? (
                <OutputPlaceholder icon={Icons.TextCursorInput} title="No input fields">Drag one onto the canvas from the Input menu.</OutputPlaceholder>
              ) : (
                fields.map((f) => {
                  const id = `field_${f.field_id || f.field_name}`;
                  const error = errors[f.field_name];
                  return (
                    <div key={f.field_id || f.field_name} className="grid gap-2">
                      <Label htmlFor={id}>
                        {f.label || f.field_name}
                        {f.required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
                      </Label>
                      <FieldControl id={id} field={f} value={values[f.field_name]} onChange={(v) => setValue(f.field_name, v)} hasError={!!error} />
                      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                    </div>
                  );
                })
              )}

              <Button type="submit" size="lg" disabled={status === 'running' || fields.length === 0}>
                <Icons.Play className="mr-2 h-4 w-4" /> Run solution
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // ---------- Screen: Results ----------
  const filledInputs = fields.filter((f) => !isEmptyValue(values[f.field_name]));
  // Before a result arrives, show the layout from the canvas. After, show only what the run returned.
  const shownComponents = status === 'done' ? results?.items || [] : components;
  const notReturned = status === 'done' ? results?.notReturned || [] : [];

  const outputScreen = (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Results</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === 'idle' && 'Nothing has run yet. This is how the results screen is laid out.'}
              {status === 'running' && 'Running the solution…'}
              {status === 'done' && `Finished${runMeta ? ` in ${formatDuration(runMeta.ms)}` : ''}${runMeta?.runId ? ` · run ${runMeta.runId}` : ''}.`}
              {status === 'error' && 'The run didn’t complete.'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => setScreen('input')}>
              <Icons.Pencil className="mr-1.5 h-4 w-4" /> Edit inputs
            </Button>
            {status === 'running' && (
              <Button variant="outline" onClick={handleCancel}>
                <Icons.Square className="mr-1.5 h-3.5 w-3.5" /> Cancel run
              </Button>
            )}
            {(status === 'done' || status === 'error') && (
              <Button onClick={handleRun}>
                <Icons.RotateCcw className="mr-1.5 h-4 w-4" /> Run again
              </Button>
            )}
          </div>
        </div>

        {status === 'error' && runError && (
          <Alert variant="destructive" className="mb-6">
            <Icons.XCircle className="h-4 w-4" />
            <AlertTitle>Run failed</AlertTitle>
            <AlertDescription className="break-words">{runError}</AlertDescription>
          </Alert>
        )}

        {notReturned.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Not returned by this run:
            {notReturned.map((c) => <Badge key={c.component_id} variant="outline" className="font-normal">{c.component_title}</Badge>)}
          </div>
        )}

        {/* What was submitted */}
        {filledInputs.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {filledInputs.map((f) => {
              const v = values[f.field_name];
              const summary = Array.isArray(v) ? `${v.length} file${v.length === 1 ? '' : 's'}` : String(v);
              return (
                <Badge key={f.field_name} variant="secondary" className="max-w-xs gap-1 font-normal">
                  <span className="shrink-0 font-medium">{f.label || f.field_name}:</span>
                  <span className="truncate">{summary}</span>
                </Badge>
              );
            })}
          </div>
        )}

        {shownComponents.length === 0 ? (
          status === 'done'
            ? <OutputPlaceholder icon={Icons.Inbox} title="No output">The run finished but didn’t return anything to show.</OutputPlaceholder>
            : <OutputPlaceholder icon={Icons.LayoutDashboard} title="No output components">Drag one onto the canvas from the Output menu.</OutputPlaceholder>
        ) : (
          <div className="grid grid-cols-6 gap-4">
            {shownComponents.map((c) => (
              <OutputCard key={c.component_id} comp={c} status={status} data={c.data} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-muted font-sans text-foreground isolate" role="dialog" aria-modal="true" aria-label="Solution preview">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-background px-6">
        <Badge variant="secondary">Preview</Badge>
        <span className="min-w-0 truncate font-semibold">{appName || 'Untitled solution'}</span>

        <Tabs value={screen} onValueChange={setScreen} className="mx-auto shrink-0">
          <TabsList>
            <TabsTrigger value="input">Input screen</TabsTrigger>
            <TabsTrigger value="output">Output screen</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex shrink-0 items-center gap-2">
          {status !== 'idle' && (
            <Button variant="ghost" onClick={handleReset}>Reset</Button>
          )}
          <Button variant="outline" onClick={onClose}>
            <Icons.X className="mr-1.5 h-4 w-4" /> Close preview
          </Button>
        </div>
      </header>

      {screen === 'input' ? inputScreen : outputScreen}
    </div>
  );
};

// ========================================================
// 5. BACKEND <-> CANVAS CONVERSION
// ========================================================

// Backend response -> React Flow nodes/edges. Existing node positions are kept when ids match.
const buildGraphFromResponse = (data, previousNodes = []) => {
  const rawSteps = data?.graph?.steps || [];
  // Backend key is spelled "input_feilds"; accept the correct spelling too
  const inputFields = data?.input_feilds || data?.input_fields || [];
  const outputComponents = data?.output_components || [];

  const nodes = [];
  const edges = [];
  const heights = {};
  const widths = {};
  const addEdge = (source, target, style, animated, sourceHandle = null) => {
    if (!target) return;
    const id = `e-${source}-${sourceHandle ? `${sourceHandle}-` : ''}${target}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, source, target, animated, style, sourceHandle });
  };

  // Steps
  rawSteps.map(normalizeRouterStep).forEach((step) => {
    const node = withDisplay({ id: step.step_id, type: 'custom', position: { x: 0, y: 0 }, data: { stepType: step.step_type, raw: step } });
    nodes.push(node);
    if (isConditionalRouter(node)) {
      const rows = getRouteRows(node);
      heights[step.step_id] = 58 + rows.reduce((h, r) => h + (GENERIC_ROUTE_KEY.test(r.key) ? 44 : 60), 0) + (routerKind(node) === 'switch' ? 30 : 0);
      widths[step.step_id] = 288;
      rows.forEach((r) => addEdge(step.step_id, r.target, EDGE_STYLE, true, r.key));
    } else {
      heights[step.step_id] = 80;
      (step.next_steps || []).forEach((t) => addEdge(step.step_id, t, EDGE_STYLE, true));
    }
  });

  // Input fields -> input step
  const inputStepIds = rawSteps.filter((s) => s.step_type === 'input').map((s) => s.step_id);
  inputFields.forEach((field) => {
    const id = field.field_id || `field_${field.field_name}`;
    nodes.push(withDisplay({ id, type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'input_field', raw: { ...field, field_id: id } } }));
    heights[id] = 100;
    const owners = rawSteps.filter((s) => s.step_type === 'input' && (s.outputs || []).includes(field.field_name)).map((s) => s.step_id);
    (owners.length ? owners : inputStepIds).forEach((stepId) => addEdge(id, stepId, FIELD_EDGE_STYLE, false));
  });

  // Output step -> output components
  const outputStepIds = rawSteps.filter((s) => s.step_type === 'output').map((s) => s.step_id);
  outputComponents.forEach((comp) => {
    const id = comp.component_id;
    nodes.push(withDisplay({ id, type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'output_component', raw: comp } }));
    heights[id] = 100;
    const owners = rawSteps.filter((s) => s.step_type === 'output' && (s.inputs || []).includes(comp.data_source)).map((s) => s.step_id);
    (owners.length ? owners : outputStepIds).forEach((stepId) => addEdge(stepId, id, COMPONENT_EDGE_STYLE, false));
  });

  // Drop edges that point at ids the backend didn't send
  const ids = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  // Layout
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 100 });
  const widthOf = (id) => widths[id] || 260;
  nodes.forEach((n) => g.setNode(n.id, { width: widthOf(n.id), height: heights[n.id] }));
  validEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const previous = Object.fromEntries(previousNodes.map((n) => [n.id, n.position]));
  const laidOut = nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: previous[n.id] || { x: p.x - widthOf(n.id) / 2, y: p.y - heights[n.id] / 2 } };
  });

  return {
    nodes: laidOut,
    edges: validEdges,
    forgeId: data?.forge_id ?? '',
    appName: data?.graph?.app_name || '',
    appDescription: data?.graph?.app_description || '',
  };
};

// Canvas -> backend JSON (same shape as the /api/build response). Edges are the source of truth for routing.
const buildRecompilePayload = ({ nodes, edges, forgeId, appName, appDescription }) => {
  const stepNodes = nodes.filter(isStepNode);
  const stepIds = new Set(stepNodes.map((n) => n.id));

  const steps = stepNodes.map((n) => {
    const raw = n.data.raw || {};
    const targets = edges.filter((e) => e.source === n.id && stepIds.has(e.target)).map((e) => e.target);

    const step = {
      ...raw,
      step_id: n.id,
      step_name: raw.step_name ?? n.data.title,
      step_type: raw.step_type ?? n.data.stepType,
      router_type: raw.router_type ?? null,
      agent_id: raw.agent_id ?? null,
      task_instruction: raw.task_instruction ?? '',
      inputs: raw.inputs || [],
      outputs: raw.outputs || [],
    };

    const hasRoutes = isConditionalRouter(n) || Object.keys(raw.conditional_routes || {}).length > 0;
    if (hasRoutes) {
      const kind = routerKind(n);
      const defKey = defaultRouteKey(n);
      const connected = Object.entries(raw.conditional_routes || {}).filter(([k, t]) =>
        t && edges.some((e) => e.source === n.id && e.target === t && (!e.sourceHandle || e.sourceHandle === k)));
      const ordered = [...connected.filter(([k]) => k !== defKey), ...connected.filter(([k]) => k === defKey)];
      const routedTargets = ordered.map(([, t]) => t);

      step.conditional_routes = ordered.length
        ? ordered.map(([k, t]) => routeToBackend(k, t, raw.route_conditions?.[k], k === defKey, kind))
        : null;
      // The backend also lists every route target in next_steps
      step.next_steps = union(routedTargets, targets.filter((t) => !routedTargets.includes(t)));
      delete step.route_conditions;
      delete step.default_route;
    } else {
      const known = (raw.next_steps || []).filter((t) => targets.includes(t));
      step.next_steps = [...known, ...targets.filter((t) => !known.includes(t))];
      step.conditional_routes = null;
    }
    return step;
  });

  return {
    forge_id: forgeId,
    graph: { app_name: appName, app_description: appDescription, steps },
    input_feilds: nodes.filter((n) => n.data.kind === 'input_field').map((n) => ({ ...n.data.raw, field_id: n.data.raw.field_id || n.id })),
    output_components: nodes.filter((n) => n.data.kind === 'output_component').map((n) => ({ ...n.data.raw })),
  };
};

// Things worth flagging before sending. Nothing here blocks the request.
const findGraphIssues = (nodes, edges) => {
  const issues = [];
  const produced = new Set(nodes.flatMap((n) => getNodeIO(n).outputs));

  nodes.forEach((n) => {
    const d = n.data;
    const raw = d.raw || {};
    const name = d.title || n.id;

    if (d.kind === 'output_component') {
      if (!raw.data_source) issues.push(`“${name}” has no data source.`);
      else if (!produced.has(raw.data_source)) issues.push(`“${name}” shows “${raw.data_source}”, but no node produces it.`);
      return;
    }
    if (d.kind === 'input_field') {
      if (!edges.some((e) => e.source === n.id)) issues.push(`Input field “${name}” isn’t connected to the input step.`);
      return;
    }

    if (d.stepType !== 'input' && !edges.some((e) => e.target === n.id)) issues.push(`“${name}” has nothing connected before it.`);
    if (d.stepType === 'agent_action' && !raw.agent_id) issues.push(`“${name}” has no agent assigned.`);
    (raw.inputs || []).forEach((x) => {
      if (!produced.has(x)) issues.push(`“${name}” reads “${x}”, but no node produces it.`);
    });

    if (isConditionalRouter(n)) {
      const ifElse = routerKind(n) === 'if_else';
      getRouteRows(n).forEach((r, i) => {
        const which = ifElse ? (r.isDefault ? 'Else' : 'If') : r.isDefault ? 'Otherwise' : `case “${r.key}”`;
        if (!r.complete) issues.push(`“${name}”: ${which} has no condition.`);
        if (!r.target && (!r.isDefault || ifElse)) issues.push(`“${name}”: ${which} isn’t connected to a step.`);
      });
    }
  });
  return issues;
};

// ========================================================
// 6. CANVAS WRAPPER
// ========================================================
const RecompileIssuesDialog = ({ issues, onCancel, onConfirm }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const shown = issues.slice(0, 8);
  return (
    <div className="fixed inset-0 z-50 bg-gray-900/30 flex items-center justify-center p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="recompile-issues-title"
        className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5">
          <h2 id="recompile-issues-title" className="font-bold text-gray-900">Some parts of the graph look incomplete</h2>
          <p className="text-sm text-gray-500 mt-1">You can fix these first, or send the graph as it is.</p>
          <ul className="mt-4 space-y-1.5 max-h-64 overflow-y-auto">
            {shown.map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <Icons.AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                {text}
              </li>
            ))}
          </ul>
          {issues.length > shown.length && <p className="text-xs text-gray-400 mt-2">And {issues.length - shown.length} more.</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 mt-4 border-t border-gray-100">
          <button onClick={onCancel} autoFocus className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50">
            Keep editing
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800">
            Recompile anyway
          </button>
        </div>
      </div>
    </div>
  );
};

const CanvasPage = ({ prompt, forgeId, appName, appDescription, initialNodes, initialEdges, onBack }) => {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [meta, setMeta] = useState({ forgeId, appName, appDescription });
  const [showPreview, setShowPreview] = useState(false);
  const closePreview = useCallback(() => setShowPreview(false), []);

  // ----- Recompile -----
  const payloadJson = useMemo(
    () => JSON.stringify(buildRecompilePayload({ nodes, edges, ...meta })),
    [nodes, edges, meta]
  );
  const [lastSyncedJson, setLastSyncedJson] = useState(() =>
    JSON.stringify(buildRecompilePayload({ nodes: initialNodes, edges: initialEdges, forgeId, appName, appDescription }))
  );
  const hasUnsentChanges = payloadJson !== lastSyncedJson;

  const [isRecompiling, setIsRecompiling] = useState(false);
  const [pendingIssues, setPendingIssues] = useState(null);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  useEffect(() => {
    if (notice?.type !== 'success') return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Warn before leaving the page with unsent changes
  useEffect(() => {
    if (!hasUnsentChanges) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsentChanges]);

  const sendRecompile = async () => {
    setPendingIssues(null);
    setIsRecompiling(true);
    setNotice(null);
    try {
      const response = await fetch('/api/recompile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadJson,
      });

      if (!response.ok) throw await errorFromResponse(response);

      const data = await response.json().catch(() => null);

      if (data?.graph?.steps) {
        // Backend returned an updated graph: load it, keeping node positions where ids still match
        const built = buildGraphFromResponse(data, nodes);
        const nextMeta = {
          forgeId: built.forgeId !== '' ? built.forgeId : meta.forgeId,
          appName: built.appName || meta.appName,
          appDescription: built.appDescription || meta.appDescription,
        };
        setNodes(built.nodes);
        setEdges(built.edges);
        setMeta(nextMeta);
        setLastSyncedJson(JSON.stringify(buildRecompilePayload({ nodes: built.nodes, edges: built.edges, ...nextMeta })));
        setNotice({ type: 'success', text: 'Recompiled. The canvas shows the graph returned by the server.' });
      } else {
        setLastSyncedJson(payloadJson);
        setNotice({ type: 'success', text: 'Recompiled.' });
      }
    } catch (error) {
      console.warn('Recompile failed:', error);
      setNotice({ type: 'error', text: `Recompile failed. ${error.message}` });
    } finally {
      setIsRecompiling(false);
    }
  };

  const handleRecompileClick = () => {
    const issues = findGraphIssues(nodes, edges);
    if (issues.length) setPendingIssues(issues);
    else sendRecompile();
  };

  return (
    <div className="h-screen w-full flex bg-white text-gray-800 font-sans overflow-hidden">

      {/* SIDEBAR */}
      <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full flex-shrink-0 z-20">
        <div className="h-20 flex items-center px-4 border-b border-gray-200 shrink-0">
          <Icons.Menu className="w-6 h-6 ml-2 text-gray-700 cursor-pointer" />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <div className="mb-6">
            <div className="px-4 text-xs font-semibold text-gray-400 mb-2">Forge ID</div>
            <div className="px-4 py-2 text-xs font-mono text-gray-600 bg-gray-100 mx-4 rounded border border-gray-200 truncate">{String(meta.forgeId)}</div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col relative min-w-0">

        {/* HEADER WITH TOOLBAR */}
        <header className="relative h-20 border-b border-gray-200 bg-white flex items-center justify-between px-6 z-30 shrink-0">

          {/* Left: Title */}
          <div className="flex-1 min-w-0 flex items-center">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Welcome to</div>
              <h1 className="text-2xl font-bold text-gray-900 leading-none truncate">AI Forge Solution</h1>
            </div>
          </div>

          {/* Center: Toolbar */}
          <div className="flex items-center space-x-2 shrink-0 bg-white border border-gray-200 p-1 rounded-xl shadow-sm mr-4">
            <DropdownMenu title="Input" icon={Icons.GripHorizontal} items={INPUT_ITEMS} />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <DropdownMenu title="Output" icon={Icons.BarChart} items={OUTPUT_ITEMS} />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <DropdownMenu title="Assets" icon={Icons.Database} items={[]} />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <DropdownMenu title="Actions" icon={Icons.Settings} items={ACTION_ITEMS} />
          </div>

          {/* Right: Recompile + Preview */}
          <div className="flex-1 flex items-center justify-end gap-3 shrink-0">
            <button
              onClick={handleRecompileClick}
              disabled={isRecompiling}
              title={hasUnsentChanges ? 'You have changes that haven’t been sent' : 'No changes since the last compile'}
              className="relative inline-flex items-center bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-800 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition shrink-0"
            >
              <Icons.RefreshCw className={`w-4 h-4 mr-2 ${isRecompiling ? 'animate-spin' : ''}`} />
              {isRecompiling ? 'Recompiling…' : 'Recompile'}
              {hasUnsentChanges && !isRecompiling && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" aria-label="Unsent changes" />
              )}
            </button>
            <button onClick={() => setShowPreview(true)} className="bg-[#b388ff] hover:bg-[#a074f0] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition flex items-center shrink-0">
              <Icons.Eye className="w-4 h-4 mr-2" /> Preview Solution
            </button>
          </div>
        </header>

        {/* CANVAS */}
        <div className="flex-1 relative bg-gray-50/50">
          <ReactFlowProvider>
            <FlowArea
              nodes={nodes}
              setNodes={setNodes}
              edges={edges}
              setEdges={setEdges}
              prompt={prompt}
            />
          </ReactFlowProvider>

          {/* Recompile result */}
          {notice && (
            <div role="status"
              className={`absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-start gap-2 max-w-lg text-sm px-4 py-2.5 rounded-lg shadow-lg border ${notice.type === 'success' ? 'bg-white border-green-200 text-gray-800' : 'bg-white border-red-200 text-gray-800'
                }`}>
              {notice.type === 'success'
                ? <Icons.CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                : <Icons.XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />}
              <span className="min-w-0 break-words">{notice.text}</span>
              {notice.type === 'error' && (
                <button onClick={() => setNotice(null)} className="ml-1 text-gray-400 hover:text-gray-700 shrink-0" aria-label="Dismiss">
                  <Icons.X size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {pendingIssues && (
        <RecompileIssuesDialog issues={pendingIssues} onCancel={() => setPendingIssues(null)} onConfirm={sendRecompile} />
      )}

      {showPreview && (
        <PreviewSolution
          nodes={nodes}
          appName={meta.appName}
          appDescription={meta.appDescription}
          forgeId={meta.forgeId}
          hasUnsentChanges={hasUnsentChanges}
          onClose={closePreview}
        />
      )}
    </div>
  );
};

// ========================================================
// 7. MAIN APP ROUTER
// ========================================================
export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [userPrompt, setUserPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [built, setBuilt] = useState(null);

  const handleStartFlow = async (promptText) => {
    setIsLoading(true);
    setUserPrompt(promptText);

    try {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });

      if (!response.ok) throw await errorFromResponse(response);
      const data = await response.json();

      setBuilt(buildGraphFromResponse(data));
      setCurrentView('canvas');
    } catch (error) {
      console.warn('API failed:', error);
      alert('Failed to connect to backend: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentView === 'landing' || !built) {
    return <LandingPage onStart={handleStartFlow} isLoading={isLoading} />;
  }

  return (
    <CanvasPage
      prompt={userPrompt}
      forgeId={built.forgeId}
      appName={built.appName}
      appDescription={built.appDescription}
      initialNodes={built.nodes}
      initialEdges={built.edges}
      onBack={() => setCurrentView('landing')}
    />
  );
}