import os

import numpy as np

import tensorflow as tf
assert tf.__version__.startswith('2')

from tflite_model_maker import image_classifier
from tflite_model_maker.image_classifier import DataLoader

fullPath = os.path.abspath('./' + 'train-images.zip')
image_path = os.path.join(os.path.dirname('./'), 'train-images')


data = DataLoader.from_folder(image_path)
train_data, test_data = data.split(0.9)

model = image_classifier.create(train_data)
loss, accuracy = model.evaluate(test_data)

model.export(export_dir='.', tflite_filename = 'model.tflite')