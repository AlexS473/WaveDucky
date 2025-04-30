import {
    mat4,
} from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';

export class MatrixStack {
    #matrix;
    #stack;

    constructor() {
        this.reset();
    }
    reset() {
        this.#matrix = mat4.identity();
        this.#stack = [];
        return this;
    }
    save() {
        this.#stack.push(this.#matrix);
        this.#matrix = mat4.copy(this.#matrix);
        return this;
    }
    restore() {
        this.#matrix = this.#stack.pop();
        return this;
    }
    get() {
        return this.#matrix;
    }
    set(matrix) {
        return this.#matrix.set(matrix);
    }
    translate(translation) {
        mat4.translate(this.#matrix, translation, this.#matrix);
        return this;
    }
    rotateX(angle) {
        mat4.rotateX(this.#matrix, angle, this.#matrix);
        return this;
    }
    rotateY(angle) {
        mat4.rotateY(this.#matrix, angle, this.#matrix);
        return this;
    }
    rotateZ(angle) {
        mat4.rotateZ(this.#matrix, angle, this.#matrix);
        return this;
    }
    scale(scale) {
        mat4.scale(this.#matrix, scale, this.#matrix);
        return this;
    }
}