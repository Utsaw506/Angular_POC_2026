import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

type Tool =
  | 'draw'
  | 'rectangle'
  | 'circle'
  | 'dottedRectangle'
  | 'dottedCircle'
  | 'crop'
  | 'select';

interface Shape {
  type: Tool;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  isSelected?: boolean;
  originalPoints?: { x: number; y: number }[];
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.css'
})
export class ImageEditorComponent implements AfterViewInit {

  @Input() imageUrl = '';
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  ctx!: CanvasRenderingContext2D;
  img = new Image();

  originalImageUrl = '';

  currentTool: Tool = 'draw';
  drawColor = '#ff0000';
  lineWidth = 3;
  brightness = 100;

  isDrawing = false;
  startX = 0;
  startY = 0;
  lastX = 0;
  lastY = 0;

  drawnShapes: Shape[] = [];
  currentPath: { x: number; y: number }[] = [];

  cropSelection: { x: number; y: number; width: number; height: number } | null = null;

  isDraggingCrop = false;
  cropDragStartX = 0;
  cropDragStartY = 0;
  cropStartX = 0;
  cropStartY = 0;

  isResizingCrop = false;
  resizeHandle: ResizeHandle = null;
  resizeStartX = 0;
  resizeStartY = 0;
  resizeOriginalCrop: { x: number; y: number; width: number; height: number } | null = null;

  selectedShape: Shape | null = null;
  isResizingShape = false;
  shapeResizeHandle: ResizeHandle = null;

  isDraggingShape = false;
  draggedShapeIndex = -1;
  dragShapeStartX = 0;
  dragShapeStartY = 0;

  shapeStartX = 0;
  shapeStartY = 0;
  shapeStartX2 = 0;
  shapeStartY2 = 0;

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.originalImageUrl = this.imageUrl;
    this.loadImage();
  }

  loadImage() {
    this.img.onload = () => {
      const c = this.canvasRef.nativeElement;
      c.width = this.img.width;
      c.height = this.img.height;
      this.redrawBase();
    };
    this.img.src = this.imageUrl;
  }

  setTool(t: Tool) {
    if (this.currentTool === 'crop' && t !== 'crop') {
      this.cropSelection = null;
      this.redrawBase();
      this.redrawShapes();
    }

    if (t !== 'select') {
      this.selectedShape = null;
      this.drawnShapes.forEach(s => s.isSelected = false);
    }

    this.currentTool = t;
  }

  reset() {
    this.imageUrl = this.originalImageUrl;
    this.drawnShapes = [];
    this.cropSelection = null;
    this.selectedShape = null;
    this.currentTool = 'draw';
    this.brightness = 100;
    this.drawColor = '#ff0000';
    this.lineWidth = 3;
    this.loadImage();
  }

  rotate(dir: 'left' | 'right') {
    const canvas = this.canvasRef.nativeElement;

    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    temp.getContext('2d')!.drawImage(canvas, 0, 0);

    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;

    const rctx = rotated.getContext('2d')!;
    rctx.translate(rotated.width / 2, rotated.height / 2);
    rctx.rotate((dir === 'left' ? -90 : 90) * Math.PI / 180);
    rctx.drawImage(temp, -canvas.width / 2, -canvas.height / 2);

    canvas.width = rotated.width;
    canvas.height = rotated.height;

    this.ctx = canvas.getContext('2d')!;
    this.ctx.filter = `brightness(${this.brightness}%)`;
    this.ctx.drawImage(rotated, 0, 0);
    this.ctx.filter = 'none';

    this.imageUrl = canvas.toDataURL();
    this.img.src = this.imageUrl;

    this.drawnShapes = [];
    this.cropSelection = null;
    this.selectedShape = null;
  }

  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    if (this.currentTool === 'crop' && this.cropSelection) {
      const handle = this.getResizeHandle(x, y, this.cropSelection);
      if (handle) {
        this.isResizingCrop = true;
        this.resizeHandle = handle;
        this.resizeStartX = x;
        this.resizeStartY = y;
        this.resizeOriginalCrop = { ...this.cropSelection };
        return;
      }

      if (this.isInsideCrop(x, y)) {
        this.isDraggingCrop = true;
        this.cropDragStartX = x;
        this.cropDragStartY = y;
        this.cropStartX = this.cropSelection.x;
        this.cropStartY = this.cropSelection.y;
        return;
      }
    }

    if (this.currentTool === 'select') {
      if (this.selectedShape) {
        const handle = this.getShapeResizeHandle(x, y, this.selectedShape);
        if (handle) {
          this.isResizingShape = true;
          this.shapeResizeHandle = handle;
          this.resizeStartX = x;
          this.resizeStartY = y;
          return;
        }

        const shapeIndex = this.getShapeAtPoint(x, y);
        if (shapeIndex !== -1 && this.drawnShapes[shapeIndex] === this.selectedShape) {
          this.isDraggingShape = true;
          this.draggedShapeIndex = shapeIndex;
          this.shapeStartX = this.selectedShape.points[0].x;
          this.shapeStartY = this.selectedShape.points[0].y;
          this.shapeStartX2 = this.selectedShape.points[1].x;
          this.shapeStartY2 = this.selectedShape.points[1].y;
          this.dragShapeStartX = x;
          this.dragShapeStartY = y;
          return;
        }
      }

      const shapeIndex = this.getShapeAtPoint(x, y);
      if (shapeIndex !== -1) {
        this.selectShape(this.drawnShapes[shapeIndex]);
        this.isDraggingShape = true;
        this.draggedShapeIndex = shapeIndex;
        this.shapeStartX = this.selectedShape!.points[0].x;
        this.shapeStartY = this.selectedShape!.points[0].y;
        this.shapeStartX2 = this.selectedShape!.points[1].x;
        this.shapeStartY2 = this.selectedShape!.points[1].y;
        this.dragShapeStartX = x;
        this.dragShapeStartY = y;
        return;
      } else {
        this.selectedShape = null;
        this.drawnShapes.forEach(s => s.isSelected = false);
        this.redrawBase();
        this.redrawShapes();
      }
      return;
    }

    const shapeIndex = this.getShapeAtPoint(x, y);
    const blockedTools: Tool[] = ['crop', 'select'];
    if (shapeIndex !== -1 && !blockedTools.includes(this.currentTool)) {
      const s = this.drawnShapes[shapeIndex];

      this.isDraggingShape = true;
      this.draggedShapeIndex = shapeIndex;

      this.shapeStartX = s.points[0].x;
      this.shapeStartY = s.points[0].y;
      this.shapeStartX2 = s.points[1].x;
      this.shapeStartY2 = s.points[1].y;

      this.dragShapeStartX = x;
      this.dragShapeStartY = y;
      return;
    }

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;
    this.lastX = x;
    this.lastY = y;

    if (this.currentTool === 'draw') {
      this.currentPath = [{ x, y }];
    }

    if (this.currentTool === 'crop') {
      this.cropSelection = { x, y, width: 0, height: 0 };
    }
  }

  onMouseMove(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    if (this.currentTool === 'crop' && this.cropSelection && !this.isDrawing && !this.isResizingCrop && !this.isDraggingCrop) {
      this.updateCursor(x, y);
    }

    if (this.currentTool === 'select' && this.selectedShape && !this.isDraggingShape && !this.isResizingShape) {
      this.updateShapeCursor(x, y);
    }

    if (!this.isDrawing && !this.isDraggingShape && !this.isDraggingCrop && !this.isResizingCrop && !this.isResizingShape) return;

    this.lastX = x;
    this.lastY = y;

    if (this.isResizingCrop && this.cropSelection && this.resizeOriginalCrop) {
      const dx = x - this.resizeStartX;
      const dy = y - this.resizeStartY;

      const original = this.resizeOriginalCrop;
      const crop = this.cropSelection;

      switch (this.resizeHandle) {
        case 'nw':
          crop.x = original.x + dx;
          crop.y = original.y + dy;
          crop.width = original.width - dx;
          crop.height = original.height - dy;
          break;
        case 'ne':
          crop.y = original.y + dy;
          crop.width = original.width + dx;
          crop.height = original.height - dy;
          break;
        case 'sw':
          crop.x = original.x + dx;
          crop.width = original.width - dx;
          crop.height = original.height + dy;
          break;
        case 'se':
          crop.width = original.width + dx;
          crop.height = original.height + dy;
          break;
        case 'n':
          crop.y = original.y + dy;
          crop.height = original.height - dy;
          break;
        case 's':
          crop.height = original.height + dy;
          break;
        case 'e':
          crop.width = original.width + dx;
          break;
        case 'w':
          crop.x = original.x + dx;
          crop.width = original.width - dx;
          break;
      }

      if (crop.width < 20) {
        if (this.resizeHandle?.includes('w')) {
          crop.x = original.x + original.width - 20;
        }
        crop.width = 20;
      }
      if (crop.height < 20) {
        if (this.resizeHandle?.includes('n')) {
          crop.y = original.y + original.height - 20;
        }
        crop.height = 20;
      }

      this.redrawBase();
      this.drawCropOverlay();
      this.redrawShapes();
      return;
    }

    if (this.isResizingShape && this.selectedShape) {
      const dx = x - this.resizeStartX;
      const dy = y - this.resizeStartY;

      const shape = this.selectedShape;
      const p0 = shape.points[0];
      const p1 = shape.points[1];

      if (!shape.originalPoints) {
        shape.originalPoints = [{ ...p0 }, { ...p1 }];
      }

      switch (this.shapeResizeHandle) {
        case 'nw':
          p0.x += dx;
          p0.y += dy;
          break;
        case 'ne':
          p0.y += dy;
          p1.x += dx;
          break;
        case 'sw':
          p0.x += dx;
          p1.y += dy;
          break;
        case 'se':
          p1.x += dx;
          p1.y += dy;
          break;
        case 'n':
          p0.y += dy;
          break;
        case 's':
          p1.y += dy;
          break;
        case 'e':
          p1.x += dx;
          break;
        case 'w':
          p0.x += dx;
          break;
      }

      if (shape.type === 'circle' || shape.type === 'dottedCircle') {
        const width = Math.abs(p1.x - p0.x);
        const height = Math.abs(p1.y - p0.y);
        const size = Math.max(width, height);

        const signX = p1.x > p0.x ? 1 : -1;
        const signY = p1.y > p0.y ? 1 : -1;

        p1.x = p0.x + (size * signX);
        p1.y = p0.y + (size * signY);
      }

      this.resizeStartX = x;
      this.resizeStartY = y;

      this.redrawBase();
      this.redrawShapes();
      return;
    }

    if (this.isDraggingCrop && this.cropSelection) {
      const dx = x - this.cropDragStartX;
      const dy = y - this.cropDragStartY;

      this.cropSelection.x = this.cropStartX + dx;
      this.cropSelection.y = this.cropStartY + dy;

      this.redrawBase();
      this.drawCropOverlay();
      this.redrawShapes();
      return;
    }

    if (this.isDraggingShape) {
      const dx = x - this.dragShapeStartX;
      const dy = y - this.dragShapeStartY;

      const s = this.drawnShapes[this.draggedShapeIndex];
      s.points[0].x = this.shapeStartX + dx;
      s.points[0].y = this.shapeStartY + dy;
      s.points[1].x = this.shapeStartX2 + dx;
      s.points[1].y = this.shapeStartY2 + dy;

      this.redrawBase();
      this.redrawShapes();
      return;
    }

    this.redrawBase();

    if (this.currentTool === 'draw') {
      this.currentPath.push({ x, y });
      this.drawPath(this.currentPath);
    }

    // if (this.currentTool === 'rectangle') {
    //   this.drawRect(this.startX, this.startY, x, y);
    // }
    // if (this.currentTool === 'dottedRectangle') {
    //   this.ctx.setLineDash([5, 5]);
    //   this.drawRect(this.startX, this.startY, x, y);
    //   this.ctx.setLineDash([]);
    // }
    // if (this.currentTool === 'circle') {
    //   this.drawCircle(this.startX, this.startY, x, y);
    // }
    // if (this.currentTool === 'circle' || this.currentTool === 'dottedCircle') {
    //   this.ctx.setLineDash([5, 5]);
    //   this.drawCircle(this.startX, this.startY, x, y);
    //   this.ctx.setLineDash([]);
    // }

    // if (this.currentTool === 'crop' && this.cropSelection) {
    //   this.cropSelection.width = x - this.startX;
    //   this.cropSelection.height = y - this.startY;
    //   this.drawCropOverlay();
    // }
    if (this.currentTool === 'rectangle') {
      this.drawRect(this.startX, this.startY, x, y);
    }
    else if (this.currentTool === 'dottedRectangle') {
      this.ctx.setLineDash([5, 5]);
      this.drawRect(this.startX, this.startY, x, y);
      this.ctx.setLineDash([]);
    }
    else if (this.currentTool === 'circle') {
      this.drawCircle(this.startX, this.startY, x, y);
    }
    else if (this.currentTool === 'dottedCircle') {
      this.ctx.setLineDash([5, 5]);
      this.drawCircle(this.startX, this.startY, x, y);
      this.ctx.setLineDash([]);
    }
    else if (this.currentTool === 'crop' && this.cropSelection) {
      this.cropSelection.width = x - this.startX;
      this.cropSelection.height = y - this.startY;
      this.drawCropOverlay();
    }

    this.redrawShapes();
  }

  onMouseUp() {
    if (this.isResizingCrop) {
      this.isResizingCrop = false;
      this.resizeHandle = null;
      this.resizeOriginalCrop = null;
      return;
    }

    if (this.isResizingShape) {
      this.isResizingShape = false;
      this.shapeResizeHandle = null;
      return;
    }

    if (this.isDraggingCrop) {
      this.isDraggingCrop = false;
      return;
    }

    if (this.isDraggingShape) {
      this.isDraggingShape = false;
      return;
    }

    if (!this.isDrawing) return;

    if (this.currentTool !== 'crop' && this.currentTool !== 'select') {
      this.saveShape();
    }

    this.isDrawing = false;
  }


  redrawBase() {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);

    this.ctx.filter = `brightness(${this.brightness}%)`;
    this.ctx.drawImage(this.img, 0, 0);
    this.ctx.filter = 'none';
  }

  drawPath(pts: any[]) {
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => this.ctx.lineTo(p.x, p.y));
    this.ctx.stroke();
  }

  drawRect(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.strokeStyle = this.drawColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  drawCircle(x1: number, y1: number, x2: number, y2: number) {
    const r = Math.hypot(x2 - x1, y2 - y1);
    this.ctx.beginPath();
    this.ctx.arc(x1, y1, r, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawCropOverlay() {
    if (!this.cropSelection) return;

    const { x, y, width, height } = this.cropSelection;
    const c = this.canvasRef.nativeElement;

    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeStyle = '#1e90ff';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.ctx.fillRect(0, 0, c.width, y);
    this.ctx.fillRect(0, y + height, c.width, c.height);
    this.ctx.fillRect(0, y, x, height);
    this.ctx.fillRect(x + width, y, c.width, height);

    this.drawResizeHandles(this.cropSelection);
  }

  drawResizeHandles(area: { x: number; y: number; width: number; height: number }) {
    const { x, y, width, height } = area;
    const handleSize = 10;

    this.ctx.fillStyle = '#1e90ff';
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;

    const handles = [
      { x: x, y: y },
      { x: x + width, y: y },
      { x: x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width / 2, y: y },
      { x: x + width / 2, y: y + height },
      { x: x + width, y: y + height / 2 },
      { x: x, y: y + height / 2 }
    ];

    handles.forEach(handle => {
      this.ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      this.ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    });
  }

  drawShapeResizeHandles(shape: Shape) {
    const p0 = shape.points[0];
    const p1 = shape.points[1];

    const minX = Math.min(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y);
    const maxX = Math.max(p0.x, p1.x);
    const maxY = Math.max(p0.y, p1.y);

    this.drawResizeHandles({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
  }


  getResizeHandle(x: number, y: number, area: { x: number; y: number; width: number; height: number }): ResizeHandle {
    const { x: cx, y: cy, width, height } = area;
    const tolerance = 10;

    const handles: { type: ResizeHandle; x: number; y: number }[] = [
      { type: 'nw', x: cx, y: cy },
      { type: 'ne', x: cx + width, y: cy },
      { type: 'sw', x: cx, y: cy + height },
      { type: 'se', x: cx + width, y: cy + height },
      { type: 'n', x: cx + width / 2, y: cy },
      { type: 's', x: cx + width / 2, y: cy + height },
      { type: 'e', x: cx + width, y: cy + height / 2 },
      { type: 'w', x: cx, y: cy + height / 2 }
    ];

    for (const handle of handles) {
      if (Math.abs(x - handle.x) <= tolerance && Math.abs(y - handle.y) <= tolerance) {
        return handle.type;
      }
    }
    return null;
  }

  getShapeResizeHandle(x: number, y: number, shape: Shape): ResizeHandle {
    if (shape.type === 'draw') return null;

    const p0 = shape.points[0];
    const p1 = shape.points[1];

    const minX = Math.min(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y);
    const maxX = Math.max(p0.x, p1.x);
    const maxY = Math.max(p0.y, p1.y);

    return this.getResizeHandle(x, y, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
  }

  updateCursor(x: number, y: number) {
    const canvas = this.canvasRef.nativeElement;

    if (!this.cropSelection) {
      canvas.style.cursor = 'crosshair';
      return;
    }

    const handle = this.getResizeHandle(x, y, this.cropSelection);

    if (handle) {
      const cursors: Record<string, string> = {
        'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
        'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize'
      };
      canvas.style.cursor = cursors[handle];
    } else if (this.isInsideCrop(x, y)) {
      canvas.style.cursor = 'move';
    } else {
      canvas.style.cursor = 'crosshair';
    }
  }

  updateShapeCursor(x: number, y: number) {
    const canvas = this.canvasRef.nativeElement;

    if (!this.selectedShape) {
      canvas.style.cursor = 'default';
      return;
    }

    const handle = this.getShapeResizeHandle(x, y, this.selectedShape);

    if (handle) {
      const cursors: Record<string, string> = {
        'nw': 'nw-resize', 'ne': 'ne-resize', 'sw': 'sw-resize', 'se': 'se-resize',
        'n': 'n-resize', 's': 's-resize', 'e': 'e-resize', 'w': 'w-resize'
      };
      canvas.style.cursor = cursors[handle];
    } else {
      const shapeIndex = this.getShapeAtPoint(x, y);
      if (shapeIndex !== -1 && this.drawnShapes[shapeIndex] === this.selectedShape) {
        canvas.style.cursor = 'move';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  }


  selectShape(shape: Shape) {
    this.drawnShapes.forEach(s => s.isSelected = false);
    shape.isSelected = true;
    this.selectedShape = shape;

    if (!shape.originalPoints && shape.points.length >= 2) {
      shape.originalPoints = shape.points.map(p => ({ ...p }));
    }

    this.redrawBase();
    this.redrawShapes();
  }

  revertShape() {
    if (!this.selectedShape || !this.selectedShape.originalPoints) return;
    this.selectedShape.points = this.selectedShape.originalPoints.map(p => ({ ...p }));
    this.redrawBase();
    this.redrawShapes();
  }

  deleteShape() {
    if (!this.selectedShape) return;

    const index = this.drawnShapes.indexOf(this.selectedShape);
    if (index !== -1) {
      this.drawnShapes.splice(index, 1);
      this.selectedShape = null;
      this.redrawBase();
      this.redrawShapes();
    }
  }

  saveShape() {
    if (this.currentTool === 'draw') {
      if (this.currentPath.length < 2) return;

      this.drawnShapes.push({
        type: 'draw',
        points: [...this.currentPath],
        color: this.drawColor,
        width: this.lineWidth
      });
      return;
    }

    if (this.startX === this.lastX && this.startY === this.lastY) return;

    const newShape: Shape = {
      type: this.currentTool,
      points: [
        { x: this.startX, y: this.startY },
        { x: this.lastX, y: this.lastY }
      ],
      color: this.drawColor,
      width: this.lineWidth,
      originalPoints: [
        { x: this.startX, y: this.startY },
        { x: this.lastX, y: this.lastY }
      ]
    };

    this.drawnShapes.push(newShape);
  }

  redrawShapes() {
    for (const s of this.drawnShapes) {
      this.ctx.strokeStyle = s.color;
      this.ctx.lineWidth = s.width;

      if (s.type === 'draw') {
        this.drawPath(s.points);
      }
      // || s.type === 'rectangle'
      if (s.type === 'rectangle') {
        this.drawRect(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
      }
      if (s.type === 'dottedRectangle') {
        this.ctx.setLineDash(s.type === 'dottedRectangle' ? [5, 5] : []);
        this.drawRect(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
        this.ctx.setLineDash([]);
      }
      if (s.type === 'circle') {
        this.drawCircle(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
      }

      if (s.type === 'dottedCircle' || s.type === 'circle') {
        this.ctx.setLineDash(s.type === 'dottedCircle' ? [5, 5] : []);
        this.drawCircle(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
        this.ctx.setLineDash([]);
      }

      if (s.isSelected && (s.type === 'rectangle' || s.type === 'dottedRectangle' ||
        s.type === 'circle' || s.type === 'dottedCircle')) {
        this.drawShapeResizeHandles(s);
      }
    }
  }

  getShapeAtPoint(x: number, y: number) {
    for (let i = this.drawnShapes.length - 1; i >= 0; i--) {
      const s = this.drawnShapes[i];

      if (s.type === 'rectangle' || s.type === 'dottedRectangle') {
        if (
          x >= Math.min(s.points[0].x, s.points[1].x) &&
          x <= Math.max(s.points[0].x, s.points[1].x) &&
          y >= Math.min(s.points[0].y, s.points[1].y) &&
          y <= Math.max(s.points[0].y, s.points[1].y)
        ) return i;
      }

      if (s.type === 'circle' || s.type === 'dottedCircle') {
        if (this.isInsideCircle(x, y, s.points[0], s.points[1])) return i;
      }
    }
    return -1;
  }

  isInsideCircle(x: number, y: number, center: { x: number; y: number }, edge: { x: number; y: number }) {
    const r = Math.hypot(edge.x - center.x, edge.y - center.y);
    const d = Math.hypot(x - center.x, y - center.y);
    return d <= r;
  }

  isInsideCrop(x: number, y: number) {
    return !!this.cropSelection &&
      x >= this.cropSelection.x &&
      x <= this.cropSelection.x + this.cropSelection.width &&
      y >= this.cropSelection.y &&
      y <= this.cropSelection.y + this.cropSelection.height;
  }

  getXY(ev: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (this.canvasRef.nativeElement.width / rect.width),
      y: (ev.clientY - rect.top) * (this.canvasRef.nativeElement.height / rect.height)
    };
  }


  // applyCrop() {
  //   if (!this.cropSelection) return;

  //   const { x, y, width, height } = this.cropSelection;

  //   const data = this.ctx.getImageData(
  //     Math.min(x, x + width),
  //     Math.min(y, y + height),
  //     Math.abs(width),
  //     Math.abs(height)
  //   );

  //   const c = this.canvasRef.nativeElement;
  //   c.width = Math.abs(width);
  //   c.height = Math.abs(height);

  //   this.ctx.putImageData(data, 0, 0);

  //   this.ctx.filter = `brightness(${this.brightness}%)`;
  //   this.ctx.drawImage(c, 0, 0);
  //   this.ctx.filter = 'none';

  //   this.imageUrl = c.toDataURL();
  //   this.img.src = this.imageUrl;

  //   this.cropSelection = null;
  //   this.drawnShapes = [];
  //   this.selectedShape = null;

  //   this.redrawBase();
  // }
  applyCrop() {
    if (!this.cropSelection) return;

    const { x, y, width, height } = this.cropSelection;

    this.redrawBase();
    this.redrawShapes();

    const data = this.ctx.getImageData(
      Math.min(x, x + width),
      Math.min(y, y + height),
      Math.abs(width),
      Math.abs(height)
    );

    const c = this.canvasRef.nativeElement;
    c.width = Math.abs(width);
    c.height = Math.abs(height);

    this.ctx.putImageData(data, 0, 0);

    this.imageUrl = c.toDataURL();

    this.cropSelection = null;
    this.drawnShapes = [];
    this.selectedShape = null;

    this.img.onload = () => {
      c.width = this.img.width;
      c.height = this.img.height;
      this.redrawBase();
    };
    this.img.src = this.imageUrl;
  }

  save() {
    const wasCropActive = this.cropSelection !== null;
    const tempCropSelection = this.cropSelection;

    this.cropSelection = null;
    this.selectedShape = null;
    this.drawnShapes.forEach(s => s.isSelected = false);

    this.redrawBase();
    this.redrawShapes();

    this.saved.emit({
      url: this.canvasRef.nativeElement.toDataURL(),
      caption: this.caption,
      enlarged: this.enlarged
    });

    if (wasCropActive) {
      this.cropSelection = tempCropSelection;
      this.redrawBase();
      if (this.cropSelection) {
        this.drawCropOverlay();
      }
      this.redrawShapes();
    }
  }
}
