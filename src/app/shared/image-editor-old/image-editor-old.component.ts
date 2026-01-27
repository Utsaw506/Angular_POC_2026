import {
  Component,
  ElementRef,
  ViewChild,
  Input,
  Output,
  EventEmitter,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Tool =
  | 'draw'
  | 'rectangle'
  | 'circle'
  | 'dottedRectangle'
  | 'dottedCircle'
  | 'crop';

interface Shape {
  type: Tool | 'path';
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

@Component({
  selector: 'app-image-editor-old',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-editor-old.component.html',
  styleUrl: './image-editor-old.component.css'
})
export class ImageEditorOldComponent implements AfterViewInit {

  // ================= INPUT / OUTPUT =================

  @Input() imageSrc!: string;
  @Output() save = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  // ================= CANVAS =================

  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  ctx!: CanvasRenderingContext2D;
  img = new Image();

  // ================= STATE =================

  currentTool: Tool = 'draw';
  drawColor = '#ff0000';
  lineWidth = 3;

  isDrawing = false;
  startX = 0;
  startY = 0;

  shapes: Shape[] = [];
  currentPath: any[] = [];

  cropSelection: any = null;

  // ================= INIT =================

  ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.loadImage();
  }

  loadImage() {
    this.img.onload = () => {
      this.canvasRef.nativeElement.width = this.img.width;
      this.canvasRef.nativeElement.height = this.img.height;
      this.redraw();
    };
    this.img.src = this.imageSrc;
  }

  // ================= DRAWING =================

  start(e: MouseEvent) {
    const p = this.getPoint(e);
    this.isDrawing = true;
    this.startX = p.x;
    this.startY = p.y;

    if (this.currentTool === 'draw') {
      this.currentPath = [{ x: p.x, y: p.y }];
    }
  }

  move(e: MouseEvent) {
    if (!this.isDrawing) return;

    const p = this.getPoint(e);
    this.redraw();

    switch (this.currentTool) {
      case 'draw':
        this.currentPath.push(p);
        this.drawPath(this.currentPath);
        break;

      case 'rectangle':
        this.ctx.strokeRect(
          this.startX,
          this.startY,
          p.x - this.startX,
          p.y - this.startY
        );
        break;

      case 'circle':
        const r = Math.hypot(p.x - this.startX, p.y - this.startY);
        this.ctx.beginPath();
        this.ctx.arc(this.startX, this.startY, r, 0, Math.PI * 2);
        this.ctx.stroke();
        break;

      case 'crop':
        this.cropSelection = {
          x: Math.min(this.startX, p.x),
          y: Math.min(this.startY, p.y),
          w: Math.abs(p.x - this.startX),
          h: Math.abs(p.y - this.startY)
        };
        this.drawCropBox();
        break;
    }
  }

  end() {
    if (!this.isDrawing) return;

    if (this.currentTool === 'draw') {
      this.shapes.push({
        type: 'path',
        points: [...this.currentPath],
        color: this.drawColor,
        width: this.lineWidth
      });
    }

    this.isDrawing = false;
  }

  // ================= RENDER =================

  redraw() {
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.drawImage(this.img,0,0);
    this.shapes.forEach(s => this.renderShape(s));
  }

  renderShape(s: Shape) {
    this.ctx.strokeStyle = s.color;
    this.ctx.lineWidth = s.width;

    if (s.type === 'path') this.drawPath(s.points);
  }

  drawPath(points:any[]) {
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x,points[0].y);
    points.forEach(p=>this.ctx.lineTo(p.x,p.y));
    this.ctx.stroke();
  }

  drawCropBox() {
    if (!this.cropSelection) return;
    this.ctx.setLineDash([6,4]);
    this.ctx.strokeRect(
      this.cropSelection.x,
      this.cropSelection.y,
      this.cropSelection.w,
      this.cropSelection.h
    );
    this.ctx.setLineDash([]);
  }

  // ================= TOOLS =================

  applyCrop() {
    const c = document.createElement('canvas');
    const cx = c.getContext('2d')!;
    c.width = this.cropSelection.w;
    c.height = this.cropSelection.h;

    cx.drawImage(
      this.canvas,
      this.cropSelection.x,
      this.cropSelection.y,
      this.cropSelection.w,
      this.cropSelection.h,
      0,0,c.width,c.height
    );

    this.img.src = c.toDataURL();
    this.cropSelection=null;
  }

  rotate(dir:number) {
    const c=document.createElement('canvas');
    const cx=c.getContext('2d')!;
    c.width=this.img.height;
    c.height=this.img.width;

    cx.translate(c.width/2,c.height/2);
    cx.rotate(dir*Math.PI/180);
    cx.drawImage(this.img,-this.img.width/2,-this.img.height/2);

    this.img.src=c.toDataURL();
  }

  reset() {
    this.shapes=[];
    this.loadImage();
  }

  saveImage() {
    this.save.emit(this.canvas.toDataURL('image/png'));
  }

  get canvas() {
    return this.canvasRef.nativeElement;
  }

  getPoint(e:MouseEvent){
    const r=this.canvas.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  }
}
