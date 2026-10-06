package main

import "fmt"

type Service struct {
	Name string
}

func (s *Service) Execute() {
	fmt.Println(s.Name)
}

func NewService(name string) *Service {
	return &Service{Name: name}
}
