import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
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
export class ImageEditorComponent {

  @Input() imageUrl = '';
  @Input() caption = '';
  @Input() enlarged = false;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{
    url: string;
    caption: string;
    enlarged: boolean;
  }>();

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private img = new Image();

  currentTool: Tool = 'draw';
  drawColor = '#ff0000';
  lineWidth = 3;

  isDrawing = false;
  startX = 0;
  startY = 0;

  currentPath: { x: number; y: number }[] = [];
  drawnShapes: Shape[] = [];

  cropRect: { x: number; y: number; w: number; h: number } | null = null;

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.loadImage();
  }

  loadImage() {
    this.img = new Image();
    this.img.onload = () => {
      const canvas = this.canvasRef.nativeElement;
      canvas.width = this.img.width;
      canvas.height = this.img.height;

      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.redraw();
    };
    this.img.src = this.imageUrl;
  }

  setTool(tool: Tool) {
    this.currentTool = tool;
    this.cropRect = null;
    this.redraw();
  }

  reset() {
    this.drawnShapes = [];
    this.currentPath = [];
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

    this.imageUrl = canvas.toDataURL('image/png');
    this.img.src = this.imageUrl;
  }

  onMouseDown(ev: MouseEvent) {
    const { x, y } = this.getXY(ev);

    this.isDrawing = true;
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'draw') {
      this.currentPath = [{ x, y }];
    }

    if (this.currentTool === 'crop') {
      this.cropRect = { x, y, w: 0, h: 0 };
    }
  }

  onMouseMove(ev: MouseEvent) {
    if (!this.isDrawing) return;

    const { x, y } = this.getXY(ev);

    this.redraw();

    switch (this.currentTool) {

      case 'draw':
        this.currentPath.push({ x, y });
        this.drawPath(this.currentPath);
        break;

      case 'rectangle':
      case 'dottedRectangle':
        this.drawRect(this.startX, this.startY, x, y);
        break;

      case 'circle':
      case 'dottedCircle':
        this.drawCircle(this.startX, this.startY, x, y);
        break;

      case 'crop':
        if (this.cropRect) {
          this.cropRect.w = x - this.startX;
          this.cropRect.h = y - this.startY;
        }
        break;
    }

    this.redrawShapes();
    if (this.cropRect) this.drawCropBox();
  }

  onMouseUp() {
    if (!this.isDrawing) return;

    if (this.currentTool !== 'crop') {
      this.saveShape();
    }

    this.isDrawing = false;
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
        { x: this.getLastX(), y: this.getLastY() }
      ],
      color: this.drawColor,
      width: this.lineWidth
    });
  }

  getLastX() {
    return this.currentPath.at(-1)?.x || this.startX;
  }

  getLastY() {
    return this.currentPath.at(-1)?.y || this.startY;
  }

  applyCrop() {
    if (!this.cropRect) return;

    const c = this.canvasRef.nativeElement;

    const x = Math.min(this.cropRect.x, this.cropRect.x + this.cropRect.w);
    const y = Math.min(this.cropRect.y, this.cropRect.y + this.cropRect.h);
    const w = Math.abs(this.cropRect.w);
    const h = Math.abs(this.cropRect.h);

    const data = this.ctx.getImageData(x, y, w, h);

    c.width = w;
    c.height = h;

    this.ctx = c.getContext('2d')!;
    this.ctx.putImageData(data, 0, 0);

    this.imageUrl = c.toDataURL('image/png');
    this.img.src = this.imageUrl;

    this.cropRect = null;
    this.drawnShapes = [];
    this.currentTool = 'draw';
  }

  redraw() {
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.ctx.drawImage(this.img, 0, 0);
  }

  redrawShapes() {
    this.drawnShapes.forEach(s => {
      this.ctx.strokeStyle = s.color;
      this.ctx.lineWidth = s.width;
      this.ctx.setLineDash(
        s.type.includes('dotted') ? [6, 6] : []
      );

      if (s.type === 'draw') this.drawPath(s.points);
      if (s.type.includes('rectangle')) this.drawRectPts(s.points);
      if (s.type.includes('circle')) this.drawCirclePts(s.points);
    });
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
    this.ctx.setLineDash(
      this.currentTool.includes('dotted') ? [6, 6] : []
    );
    this.ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  drawRectPts(p: any[]) {
    this.drawRect(p[0].x, p[0].y, p[1].x, p[1].y);
  }

  drawCircle(x1: number, y1: number, x2: number, y2: number) {
    const r = Math.hypot(x2 - x1, y2 - y1);
    this.ctx.beginPath();
    this.ctx.setLineDash(
      this.currentTool.includes('dotted') ? [6, 6] : []
    );
    this.ctx.arc(x1, y1, r, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawCirclePts(p: any[]) {
    this.drawCircle(p[0].x, p[0].y, p[1].x, p[1].y);
  }

  drawCropBox() {
    if (!this.cropRect) return;
    this.ctx.setLineDash([8, 6]);
    this.ctx.strokeStyle = '#0066ff';
    this.ctx.strokeRect(
      this.cropRect.x,
      this.cropRect.y,
      this.cropRect.w,
      this.cropRect.h
    );
    this.ctx.setLineDash([]);
  }

  save() {
    const base64 = this.canvasRef.nativeElement.toDataURL('image/png');
    this.saved.emit({
      url: base64,
      caption: this.caption,
      enlarged: this.enlarged
    });
  }

  getXY(ev: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;

    return {
      x: (ev.clientX - rect.left) * scaleX,
      y: (ev.clientY - rect.top) * scaleY
    };
  }
}
