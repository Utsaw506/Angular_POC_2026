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

type Tool =
  | 'draw'
  | 'rectangle'
  | 'circle'
  | 'dottedRectangle'
  | 'dottedCircle'
  | 'crop';

interface Shape {
  type: Tool;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-editor.component.html',
  styleUrl: './image-editor.component.css'
})
export class ImageEditorComponent implements AfterViewInit {

  /* ---------------- Inputs / Outputs ---------------- */

  @Input() imageUrl = '';
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();

  /* ---------------- Canvas ---------------- */

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  ctx!: CanvasRenderingContext2D;
  img = new Image();

  /* ---------------- State ---------------- */

  currentTool: Tool = 'draw';
  drawColor = '#ff0000';
  lineWidth = 3;

  isDrawing = false;
  startX = 0;
  startY = 0;

  lastX = 0;
  lastY = 0;

  drawnShapes: Shape[] = [];
  currentPath: { x: number; y: number }[] = [];

  /* Crop */

  cropSelection:
    { x: number; y: number; width: number; height: number } | null = null;

  isDraggingCrop = false;
  dragStartX = 0;
  dragStartY = 0;
  cropStartX = 0;
  cropStartY = 0;

  /* Shape Drag */

  isDraggingShape = false;
  draggedShapeIndex = -1;
  dragShapeStartX = 0;
  dragShapeStartY = 0;

  shapeStartX = 0;
  shapeStartY = 0;
  shapeStartX2 = 0;
  shapeStartY2 = 0;

  /* ---------------- Init ---------------- */

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
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

  /* ---------------- Tools ---------------- */

  setTool(t: Tool) {
    if (this.currentTool === 'crop' && t !== 'crop') {
      this.cropSelection = null;
    }
    this.currentTool = t;
  }

  reset() {
    this.drawnShapes = [];
    this.cropSelection = null;
    this.currentTool = 'draw';
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
    this.ctx.drawImage(rotated, 0, 0);

    this.imageUrl = canvas.toDataURL();
    this.img.src = this.imageUrl;

    this.drawnShapes = [];
  }

  /* ---------------- Mouse ---------------- */

  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    const shapeIndex = this.getShapeAtPoint(x, y);
    if (shapeIndex !== -1 && this.currentTool !== 'crop') {
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

    if (this.currentTool === 'draw') {
      this.currentPath = [{ x, y }];
    }

    if (this.currentTool === 'crop') {
      this.cropSelection = { x, y, width: 0, height: 0 };
    }
  }

  onMouseMove(ev: MouseEvent) {
    if (!this.isDrawing && !this.isDraggingShape) return;

    const { x, y } = this.getXY(ev);
    this.lastX = x;
    this.lastY = y;

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

    if (this.currentTool === 'rectangle' || this.currentTool === 'dottedRectangle') {
      this.drawRect(this.startX, this.startY, x, y);
    }

    if (this.currentTool === 'circle' || this.currentTool === 'dottedCircle') {
      this.drawCircle(this.startX, this.startY, x, y);
    }

    if (this.currentTool === 'crop' && this.cropSelection) {
      this.cropSelection.width = x - this.startX;
      this.cropSelection.height = y - this.startY;
      this.drawCrop();
    }

    this.redrawShapes();
  }

  onMouseUp() {
    if (this.isDraggingShape) {
      this.isDraggingShape = false;
      return;
    }

    if (!this.isDrawing) return;

    if (this.currentTool !== 'crop') {
      this.saveShape();
    }

    this.isDrawing = false;
  }

  /* ---------------- Drawing ---------------- */

  redrawBase() {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ctx.drawImage(this.img, 0, 0);
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

  drawCrop() {
    if (!this.cropSelection) return;
    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeStyle = '#0066ff';
    this.ctx.strokeRect(
      this.cropSelection.x,
      this.cropSelection.y,
      this.cropSelection.width,
      this.cropSelection.height
    );
    this.ctx.setLineDash([]);
  }

  saveShape() {
    if (this.currentTool === 'draw') {
      this.drawnShapes.push({
        type: 'draw',
        points: [...this.currentPath],
        color: this.drawColor,
        width: this.lineWidth
      });
      return;
    }

    this.drawnShapes.push({
      type: this.currentTool,
      points: [
        { x: this.startX, y: this.startY },
        { x: this.lastX, y: this.lastY }
      ],
      color: this.drawColor,
      width: this.lineWidth
    });
  }

  redrawShapes() {
    for (const s of this.drawnShapes) {
      this.ctx.strokeStyle = s.color;
      this.ctx.lineWidth = s.width;

      if (s.type === 'draw') this.drawPath(s.points);
      if (s.type.includes('rectangle'))
        this.drawRect(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
      if (s.type.includes('circle'))
        this.drawCircle(s.points[0].x, s.points[0].y, s.points[1].x, s.points[1].y);
    }
  }

  getShapeAtPoint(x: number, y: number) {
    for (let i = this.drawnShapes.length - 1; i >= 0; i--) {
      const s = this.drawnShapes[i];
      if (
        s.type.includes('rectangle') &&
        x >= Math.min(s.points[0].x, s.points[1].x) &&
        x <= Math.max(s.points[0].x, s.points[1].x) &&
        y >= Math.min(s.points[0].y, s.points[1].y) &&
        y <= Math.max(s.points[0].y, s.points[1].y)
      ) return i;
    }
    return -1;
  }

  getXY(ev: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) *
        (this.canvasRef.nativeElement.width / rect.width),
      y: (ev.clientY - rect.top) *
        (this.canvasRef.nativeElement.height / rect.height)
    };
  }

  applyCrop() {
    if (!this.cropSelection) return;

    const { x, y, width, height } = this.cropSelection;

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
    this.img.src = this.imageUrl;

    this.cropSelection = null;
    this.drawnShapes = [];
  }

  save() {
    this.saved.emit({
      url: this.canvasRef.nativeElement.toDataURL(),
      caption: this.caption,
      enlarged: this.enlarged
    });
  }
}
