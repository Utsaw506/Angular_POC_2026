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


  @Input() imageUrl = '';
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();


  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  ctx!: CanvasRenderingContext2D;
  img = new Image();


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


  cropSelection:
    { x: number; y: number; width: number; height: number } | null = null;

  isDraggingCrop = false;
  cropDragStartX = 0;
  cropDragStartY = 0;
  cropStartX = 0;
  cropStartY = 0;


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
    }
    this.currentTool = t;
  }

  reset() {
    this.drawnShapes = [];
    this.cropSelection = null;
    this.currentTool = 'draw';
    this.brightness = 100;
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
  }


  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    if (
      this.currentTool === 'crop' &&
      this.cropSelection &&
      this.isInsideCrop(x, y)
    ) {
      this.isDraggingCrop = true;
      this.cropDragStartX = x;
      this.cropDragStartY = y;
      this.cropStartX = this.cropSelection.x;
      this.cropStartY = this.cropSelection.y;
      return;
    }

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

    if (!this.isDrawing &&
      !this.isDraggingShape &&
      !this.isDraggingCrop) return;

    const { x, y } = this.getXY(ev);
    this.lastX = x;
    this.lastY = y;

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

    if (this.currentTool === 'rectangle' ||
      this.currentTool === 'dottedRectangle') {
      this.drawRect(this.startX, this.startY, x, y);
    }

    if (this.currentTool === 'circle' ||
      this.currentTool === 'dottedCircle') {
      this.drawCircle(this.startX, this.startY, x, y);
    }

    if (this.currentTool === 'crop' && this.cropSelection) {
      this.cropSelection.width = x - this.startX;
      this.cropSelection.height = y - this.startY;
      this.drawCropOverlay();
    }

    this.redrawShapes();
  }

  onMouseUp() {

    if (this.isDraggingCrop) {
      this.isDraggingCrop = false;
      return;
    }

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

      if (s.type === 'rectangle' || s.type === 'dottedRectangle') {
        this.drawRect(
          s.points[0].x, s.points[0].y,
          s.points[1].x, s.points[1].y
        );
      }

      if (s.type === 'circle' || s.type === 'dottedCircle') {
        this.drawCircle(
          s.points[0].x, s.points[0].y,
          s.points[1].x, s.points[1].y
        );
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

        if (this.isInsideCircle(x, y, s.points[0], s.points[1]))
          return i;
      }
    }
    return -1;
  }

  isInsideCircle(
    x: number,
    y: number,
    center: { x: number; y: number },
    edge: { x: number; y: number }
  ) {
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

    this.ctx.filter = `brightness(${this.brightness}%)`;
    this.ctx.drawImage(c, 0, 0);
    this.ctx.filter = 'none';

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
